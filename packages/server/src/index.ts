import { createServer } from "node:http";

import { app } from "./app.js";
import { config } from "./config.js";
import { connectDatabase, disconnectDatabase } from "./db.js";
import { logger } from "./logger.js";
import { disconnectKafka } from "./messaging/kafka.js";
import { connectRedis, disconnectRedis } from "./services/cache.js";

const port = config.port;

const server = createServer(app);

const shutdown = async () => {
  logger.info("Shutting down API service");
  server.close();
  await Promise.allSettled([disconnectKafka(), disconnectRedis(), disconnectDatabase()]);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const bootstrap = async () => {
  try {
    await connectDatabase();
    await connectRedis();
    server.listen(port, () => {
      logger.info({ port, service: config.serviceName, kafkaBrokers: config.kafkaBrokers }, "API server listening");
    });
  } catch (error) {
    logger.error({ error }, "Failed to start API service");
    process.exit(1);
  }
};

void bootstrap();
