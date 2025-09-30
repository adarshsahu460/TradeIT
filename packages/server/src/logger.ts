import pino from "pino";

import { config } from "./config.js";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: config.logLevel ?? (isProd ? "info" : "debug"),
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
      },
});

export const withCorrelation = (correlationId?: string) =>
  correlationId ? logger.child({ correlationId }) : logger;
