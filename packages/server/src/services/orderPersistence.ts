type OrderStatus = "open" | "partial" | "filled" | "cancelled" | "rejected";

import { getPrismaClient } from "../db.js";
import { logger } from "../logger.js";
import type { ProcessedOrderResult } from "../matching/MatchingEngine.js";

// Allocate the next per-symbol sequence using a serialized update.
// We avoid an extra table by computing next = (max(sequence)+1) under a FOR UPDATE lock on affected rows.
// For higher throughput a dedicated SymbolSequence table would be cleaner; this is acceptable initial implementation.
async function allocateSequence(tx: any, symbol: string): Promise<bigint> {
  // Use a single-row locking strategy: we select the current max within the symbol with an advisory lock.
  // Simpler approach: select max(sequence) then +1. This risks race without tx serialization, so rely on SERIALIZABLE retry or explicit table lock.
  // Here we use FOR UPDATE on the rows of this symbol (could be many). For large books, switch to separate sequence table.
  // NOTE: Removed FOR SHARE because Postgres disallows it with aggregate in this form (error 0A000). Potential race:
  // two concurrent transactions could read same MAX and attempt insert with same sequence causing unique violation (if we add a unique constraint).
  // For now we rely on low contention + retry on failure or future dedicated sequence table per symbol.
  const result = (await tx.$queryRawUnsafe(
    `SELECT COALESCE(MAX("sequence"), 0)::bigint + 1 AS next FROM "Order" WHERE "symbol" = $1`,
    symbol,
  )) as Array<{ next: bigint }>;
  return result[0].next;
}

const prisma = getPrismaClient();

const determineOrderStatus = (orderQuantity: number, remainingQuantity: number): OrderStatus => {
  if (remainingQuantity === orderQuantity) {
    return "open";
  }

  if (remainingQuantity > 0) {
    return "partial";
  }

  return "filled";
};

export const persistProcessedOrder = async (result: ProcessedOrderResult) => {
  if (result.status !== "accepted" || !result.order) {
    return;
  }

  const { order, trades, resting } = result;
  const totalFilledQuantity = trades.reduce((sum, trade) => sum + trade.quantity, 0);
  const remainingQuantity = resting?.quantity ?? 0;
  const status = determineOrderStatus(order.quantity, remainingQuantity);

  try {
    await prisma.$transaction(async (tx: any) => {
      const sequence = await allocateSequence(tx, order.symbol);
      // Persist taker/new order
      await tx.order.create({
        data: {
          id: order.id,
          userId: order.userId,
          symbol: order.symbol,
          sequence: sequence,
          side: order.side,
          type: order.type,
          price: order.price,
          quantity: order.quantity,
          filledQuantity: totalFilledQuantity,
          remainingQuantity,
          status,
        },
      });
      // Mutate in-memory object so subsequent event publication can include sequence
      (order as any).sequence = Number(sequence);

      for (const trade of trades) {
        await tx.trade.create({
          data: {
            id: trade.id,
            takerOrderId: trade.takerOrderId,
            makerOrderId: trade.makerOrderId,
            symbol: trade.symbol,
            price: trade.price,
            quantity: trade.quantity,
            executedAt: new Date(trade.timestamp),
          },
        });

        const maker = await tx.order.findUnique({ where: { id: trade.makerOrderId } });
        if (maker) {
          const makerRemaining = Math.max(maker.remainingQuantity - trade.quantity, 0);
          const makerStatus = determineOrderStatus(maker.quantity, makerRemaining);

          await tx.order.update({
            where: { id: maker.id },
            data: {
              remainingQuantity: makerRemaining,
              filledQuantity: maker.quantity - makerRemaining,
              status: makerStatus,
            },
          });
        }
      }
    });
  } catch (error) {
    logger.error({ error }, "Failed to persist processed order");
    throw error;
  }
};
