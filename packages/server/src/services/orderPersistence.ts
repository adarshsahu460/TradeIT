type OrderStatus = "open" | "partial" | "filled" | "cancelled" | "rejected";

import { getPrismaClient } from "../db.js";
import { logger } from "../logger.js";
import type { ProcessedOrderResult } from "../matching/MatchingEngine.js";

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
    await prisma.$transaction(async (tx : any) => {
      await tx.order.create({
        data: {
          id: order.id,
          userId: order.userId,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          price: order.price,
          quantity: order.quantity,
          filledQuantity: totalFilledQuantity,
          remainingQuantity,
          status,
        },
      });

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
