import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
};
