import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../auth/middleware";
import { engine } from "../matching";
import type { IncomingOrder } from "../matching";
import { logger } from "../logger";
import { persistProcessedOrder } from "../services/orderPersistence";

const router = Router();

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

type OrderPayload = z.infer<typeof orderSchema>;

const toIncomingOrder = (payload: OrderPayload, userId: string): IncomingOrder => ({
  userId,
  symbol: payload.symbol,
  side: payload.side,
  type: payload.type,
  quantity: payload.quantity,
  price: payload.type === "limit" ? payload.price : payload.price ?? undefined,
});

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

  const incomingOrder = toIncomingOrder(parsed.data, req.user.id);
  const result = engine.placeOrder(incomingOrder);

  logger.info({ order: incomingOrder, result }, "Processed order");

  if (result.status === "accepted") {
    try {
      await persistProcessedOrder(result);
    } catch (error) {
      logger.error({ error }, "Failed to persist order result");
    }
  }

  if (result.status === "rejected") {
    return res.status(422).json({
      status: "rejected",
      reason: result.reason,
    });
  }

  return res.status(201).json({
    status: "accepted",
    order: result.order,
    trades: result.trades,
    resting: result.resting,
    snapshot: result.snapshot,
  });
});

export { router as orderRouter };
