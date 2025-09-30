-- DropIndex
DROP INDEX "Order_sequence_idx";

-- CreateTable
CREATE TABLE "EventOutbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "orderSymbol" TEXT,
    "orderSequence" BIGINT,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventOutbox_publishedAt_idx" ON "EventOutbox"("publishedAt");

-- CreateIndex
CREATE INDEX "EventOutbox_eventType_idx" ON "EventOutbox"("eventType");

-- CreateIndex
CREATE INDEX "EventOutbox_orderSymbol_orderSequence_idx" ON "EventOutbox"("orderSymbol", "orderSequence");
