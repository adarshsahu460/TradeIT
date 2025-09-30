import { randomUUID, createHash } from "node:crypto";

import type { OrderCommand } from "@tradeit/shared";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../auth/middleware.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { encodeMessage } from "../messaging/codec.js";
import { getPrismaClient } from "../db.js";
import { withCorrelation } from "../logger.js";
import { getProducer } from "../messaging/kafka.js";

const orderSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .transform((value: string) => value.toUpperCase()),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["limit", "market"]),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
});

const router = Router();

router.post("/", authenticate, async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId as string | undefined;
  const log = withCorrelation(correlationId);
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: "error",
      errors: parsed.error.format(),
    });
  }

  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  const payload = parsed.data;

  // Idempotency key logic
  const idempotencyKey = (req.headers["x-idempotency-key"] as string | undefined)?.trim();
  const prisma = getPrismaClient();
  if (idempotencyKey) {
    // Hash body + user to avoid leaking body data if stored
    const bodyHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    try {
  const existing = await (prisma as any).idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (existing) {
        // Validate same user & hash
        if (existing.userId !== req.user.id || existing.bodyHash !== bodyHash) {
          return res.status(409).json({ status: "error", message: "Idempotency key conflict" });
        }
        return res.status(202).json({
          status: "queued",
          commandId: existing.commandId,
          idempotencyKey,
          receivedAt: existing.createdAt.getTime(),
          idempotent: true,
        });
      }
      await (prisma as any).idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId: req.user.id,
          bodyHash,
          commandId: "pending", // will update after enqueue
        },
      });
    } catch (e) {
      log.warn({ err: e }, "Failed idempotency pre-check");
    }
  }

  const command: OrderCommand = {
    commandId: randomUUID(),
    userId: req.user.id,
    symbol: payload.symbol,
    side: payload.side,
    type: payload.type,
    quantity: payload.quantity,
    price: payload.type === "limit" ? payload.price : undefined,
    timestamp: Date.now(),
    source: config.serviceName,
  };

  try {
    const producer = await getProducer();
    await producer.send({
      topic: config.kafkaOrderTopic,
      messages: [
        {
          key: command.symbol,
          value: encodeMessage(command),
        },
      ],
    });
    log.info({ commandId: command.commandId, symbol: command.symbol }, "Order enqueued successfully");
    if (idempotencyKey) {
      // Best-effort update (ignore failure)
      void (prisma as any).idempotencyKey.update({
        where: { key: idempotencyKey },
        data: { commandId: command.commandId },
      }).catch((e: unknown) => log.warn({ err: e }, "Failed to update idempotency record"));
    }
  } catch (error) {
    log.error({ error }, "Failed to enqueue order command");
    return res.status(503).json({ status: "error", message: "Order queue unavailable" });
  }

  return res.status(202).json({
    status: "queued",
    commandId: command.commandId,
    idempotencyKey: idempotencyKey || null,
    receivedAt: command.timestamp,
  });
});

export { router as orderRouter };
