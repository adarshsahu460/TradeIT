import { randomUUID } from "node:crypto";

import type { OrderCommand } from "@tradeit/shared";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../auth/middleware.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { encodeMessage } from "../messaging/codec.js";
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
    logger.info({ commandId: command.commandId, symbol: command.symbol }, "Order enqueued successfully");
  } catch (error) {
    logger.error({ error }, "Failed to enqueue order command");
    return res.status(503).json({ status: "error", message: "Order queue unavailable" });
  }

  return res.status(202).json({
    status: "queued",
    commandId: command.commandId,
    receivedAt: command.timestamp,
  });
});

export { router as orderRouter };
