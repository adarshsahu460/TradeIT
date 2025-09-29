-- Create extensions required for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enums
CREATE TYPE "OrderSide" AS ENUM ('buy', 'sell');
CREATE TYPE "OrderType" AS ENUM ('limit', 'market');
CREATE TYPE "OrderStatus" AS ENUM ('open', 'partial', 'filled', 'cancelled', 'rejected');

-- Create tables
CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL,
  "symbol" TEXT NOT NULL,
  "side" "OrderSide" NOT NULL,
  "type" "OrderType" NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "filledQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remainingQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "OrderStatus" NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "Trade" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "takerOrderId" TEXT NOT NULL,
  "makerOrderId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Trade_takerOrderId_fkey" FOREIGN KEY ("takerOrderId") REFERENCES "Order"("id") ON DELETE CASCADE,
  CONSTRAINT "Trade_makerOrderId_fkey" FOREIGN KEY ("makerOrderId") REFERENCES "Order"("id") ON DELETE CASCADE
);

CREATE TABLE "RefreshToken" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jti" TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Indexes
CREATE INDEX "Order_symbol_status_idx" ON "Order" ("symbol", "status");
CREATE INDEX "Trade_symbol_executedAt_idx" ON "Trade" ("symbol", "executedAt");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken" ("userId");

-- Update triggers to maintain updatedAt timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_updated_at
BEFORE UPDATE ON "Order"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_user_updated_at
BEFORE UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
