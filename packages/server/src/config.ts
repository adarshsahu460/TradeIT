import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = process.env.ENV_FILE;

const candidateEnvPaths = envFile
  ? [envFile]
  : [
      resolve(process.cwd(), ".env"),
      resolve(__dirname, "../.env"),
      resolve(__dirname, "../../.env"),
      resolve(__dirname, "../../../.env"),
    ];

candidateEnvPaths.forEach((candidate) => {
  if (!candidate) {
    return;
  }
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false });
  }
});

const envSchema = z.object({
  PORT: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  FRONTEND_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().optional(),
  REFRESH_TOKEN_COOKIE_NAME: z.string().optional(),
  REFRESH_TOKEN_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  SEED_BOOK: z.enum(["true", "false"]).optional(),
  RUN_DATABASE_MIGRATIONS: z.enum(["true", "false"]).optional(),
  ENABLE_SYNTHETIC_TRADES: z.enum(["true", "false"]).optional(),
  SYNTHETIC_TRADES_INTERVAL_MS: z.string().optional(),
  GATEWAY_PORT: z.string().optional(),
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_CLIENT_ID: z.string().optional(),
  KAFKA_ORDER_TOPIC: z.string().optional(),
  KAFKA_MARKET_TOPIC: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SERVICE_NAME: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

const isTestEnvironment = process.env.NODE_ENV === "test";

const requiredKeys = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
] as const;

type RequiredKey = (typeof requiredKeys)[number];

const ensureRequired = (key: RequiredKey): string => {
  const value = parsed[key];
  if (!value) {
    if (isTestEnvironment) {
      if (key === "DATABASE_URL") {
        return "postgresql://postgres:postgres@localhost:5432/tradeit_test";
      }
      return `${key.toLowerCase()}-test-secret`;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

type Config = {
  port: number;
  logLevel: string;
  frontendUrl?: string;
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  refreshTokenCookieName: string;
  refreshTokenCookieSecure: boolean;
  seedBook: boolean;
  isTestEnvironment: boolean;
  runDatabaseMigrations: boolean;
  enableSyntheticTrades: boolean;
  syntheticTradesIntervalMs: number;
  gatewayPort: number;
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaOrderTopic: string;
  kafkaMarketTopic: string;
  redisUrl?: string;
  serviceName: string;
};

export const config: Config = {
  port: Number.parseInt(parsed.PORT ?? "4000", 10),
  logLevel: parsed.LOG_LEVEL,
  frontendUrl: parsed.FRONTEND_URL,
  databaseUrl: ensureRequired("DATABASE_URL"),
  jwtAccessSecret: ensureRequired("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: ensureRequired("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: parsed.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: parsed.JWT_REFRESH_EXPIRES_IN ?? "7d",
  refreshTokenCookieName: parsed.REFRESH_TOKEN_COOKIE_NAME ?? "tradeit_rt",
  refreshTokenCookieSecure: parsed.REFRESH_TOKEN_COOKIE_SECURE === "true",
  seedBook: parsed.SEED_BOOK !== "false",
  isTestEnvironment,
  runDatabaseMigrations: parsed.RUN_DATABASE_MIGRATIONS !== "false",
  enableSyntheticTrades: parsed.ENABLE_SYNTHETIC_TRADES !== "false",
  syntheticTradesIntervalMs: (() => {
    const value = parsed.SYNTHETIC_TRADES_INTERVAL_MS;
    if (!value) {
      return 1500;
    }
    const parsedValue = Number.parseInt(value, 10);
    return Number.isNaN(parsedValue) ? 1500 : Math.max(parsedValue, 250);
  })(),
  gatewayPort: Number.parseInt(parsed.GATEWAY_PORT ?? "4001", 10),
  kafkaBrokers: (parsed.KAFKA_BROKERS ?? "localhost:29092").split(",").map((broker) => broker.trim()),
  kafkaClientId: parsed.KAFKA_CLIENT_ID ?? `tradeit-${process.pid}`,
  kafkaOrderTopic: parsed.KAFKA_ORDER_TOPIC ?? "orders.commands",
  kafkaMarketTopic: parsed.KAFKA_MARKET_TOPIC ?? "market.events",
  redisUrl: parsed.REDIS_URL,
  serviceName: parsed.SERVICE_NAME ?? "tradeit-service",
};
