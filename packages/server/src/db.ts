import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import { config } from "./config";
import { logger } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverRoot = resolve(__dirname, "..");
const prismaSchemaPath = resolve(serverRoot, "prisma/schema.prisma");

const findPrismaBinary = () => {
  const candidates = [
    process.env.PRISMA_CLI_PATH,
    resolve(process.cwd(), "node_modules/.bin/prisma"),
    resolve(serverRoot, "node_modules/.bin/prisma"),
    resolve(serverRoot, "../node_modules/.bin/prisma"),
    resolve(serverRoot, "../../node_modules/.bin/prisma"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

let migrationsApplied = false;
let migrationsPromise: Promise<void> | null = null;

const applyMigrations = async () => {
  const prismaBinary = findPrismaBinary();
  if (!prismaBinary) {
    logger.warn("Prisma CLI binary not found; skipping automatic migrations");
    return;
  }

  logger.info("Applying database migrations");

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(prismaBinary, ["migrate", "deploy", "--schema", prismaSchemaPath], {
      cwd: serverRoot,
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Prisma migrate deploy failed with exit code ${code}`));
      }
    });

    child.on("error", (error) => {
      rejectPromise(error);
    });
  });

  logger.info("Database migrations applied");
};

const ensureMigrations = async () => {
  if (migrationsApplied) {
    return;
  }

  if (migrationsPromise) {
    return migrationsPromise;
  }

  migrationsPromise = applyMigrations()
    .then(() => {
      migrationsApplied = true;
    })
    .catch((error) => {
      migrationsApplied = false;
      throw error;
    })
    .finally(() => {
      migrationsPromise = null;
    });

  return migrationsPromise;
};

let prisma: PrismaClient | null = null;

export const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient({
      log: config.isTestEnvironment ? [] : ["error", "warn"],
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });
  }

  return prisma;
};

export const connectDatabase = async () => {
  if (config.isTestEnvironment) {
    return;
  }

  if (config.runDatabaseMigrations) {
    await ensureMigrations();
  }

  const client = getPrismaClient();
  await client.$connect();
  logger.info("Connected to database");
};

export const disconnectDatabase = async () => {
  if (!prisma) {
    return;
  }
  await prisma.$disconnect();
  prisma = null;
};
