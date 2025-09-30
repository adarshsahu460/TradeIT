-- Add sequence column and helper table for per-symbol sequence allocation
ALTER TABLE "Order" ADD COLUMN "sequence" BIGINT;

-- Backfill existing orders per symbol by createdAt ordering
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY "createdAt", id) AS rn
  FROM "Order"
)
UPDATE "Order" o
SET "sequence" = ordered.rn
FROM ordered
WHERE o.id = ordered.id;

-- Enforce NOT NULL after backfill
ALTER TABLE "Order" ALTER COLUMN "sequence" SET NOT NULL;

-- Unique constraint per symbol already defined in Prisma schema will be applied by prisma migrate diff (if not, create explicitly):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'Order_symbol_sequence_key'
  ) THEN
    BEGIN
      ALTER TABLE "Order" ADD CONSTRAINT "Order_symbol_sequence_key" UNIQUE ("symbol", "sequence");
    EXCEPTION WHEN duplicate_table THEN
      -- ignore
    END;
  END IF;
END;$$;

-- Optional: global index for sequence scans (not unique)
CREATE INDEX IF NOT EXISTS "Order_sequence_idx" ON "Order" ("sequence");
