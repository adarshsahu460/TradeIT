import { Redis } from "ioredis";

import { config } from "../config.js";
import { logger } from "../logger.js";

let redisClient: Redis | null = null;

export const getRedisClient = () => {
  if (!config.redisUrl) {
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      lazyConnect: true,
    });
  }
  return redisClient;
};

export const connectRedis = async () => {
  const client = getRedisClient();
  if (!client) {
    return null;
  }
  if (client.status === "ready" || client.status === "connecting") {
    return client;
  }
  await client.connect();
  logger.info("Redis connected");
  return client;
};

export const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info("Redis disconnected");
  }
};
