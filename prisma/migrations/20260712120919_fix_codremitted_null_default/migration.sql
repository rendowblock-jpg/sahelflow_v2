-- Fix B2 (S1): codRemitted NULL-vs-false — COD reconciliation was silently broken.
--
-- Root cause: codRemitted was `Boolean?` with NO default, so freshly-collected
-- orders had codRemitted=NULL. The reconciliation queries filtered
-- `codRemitted: false`, but NULL !== false in Prisma/SQLite — so the
-- pending-remittance list was EMPTY for every collected order.
--
-- Fix (this migration): rebuild the Order table with
--   codRemitted BOOLEAN NOT NULL DEFAULT false
-- and backfill existing NULLs via `coalesce("codRemitted", false)` during the
-- data copy (SQLite can't ALTER COLUMN, so Prisma uses the table-rebuild
-- pattern). Code-level fixes in cod-service.ts (markCodCollected sets
-- codRemitted=false explicitly + filters use `{ not: true }`) provide
-- belt-and-suspenders protection for pre-migration rows in dev/staging.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "customerId" TEXT NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "deliveryCost" INTEGER,
    "wilaya" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneBlindIndex" TEXT,
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "sourceOrderId" TEXT,
    "sourceMetadata" TEXT,
    "notes" TEXT,
    "confirmedAt" DATETIME,
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "codCollected" BOOLEAN,
    "codCollectedAt" DATETIME,
    "codRemitted" BOOLEAN NOT NULL DEFAULT false,
    "codRemittedAt" DATETIME,
    "codRemittanceRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "codCollected", "codCollectedAt", "codRemittanceRef", "codRemitted", "codRemittedAt", "commune", "confirmedAt", "createdAt", "customerId", "deletedAt", "deliveredAt", "deliveryCost", "id", "notes", "orderNumber", "phone", "phoneBlindIndex", "shippedAt", "source", "sourceMetadata", "sourceOrderId", "status", "totalPrice", "updatedAt", "version", "wilaya") SELECT "address", "codCollected", "codCollectedAt", "codRemittanceRef", coalesce("codRemitted", false) AS "codRemitted", "codRemittedAt", "commune", "confirmedAt", "createdAt", "customerId", "deletedAt", "deliveredAt", "deliveryCost", "id", "notes", "orderNumber", "phone", "phoneBlindIndex", "shippedAt", "source", "sourceMetadata", "sourceOrderId", "status", "totalPrice", "updatedAt", "version", "wilaya" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_source_idx" ON "Order"("source");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_phoneBlindIndex_idx" ON "Order"("phoneBlindIndex");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");
CREATE INDEX "Order_codRemitted_idx" ON "Order"("codRemitted");
CREATE INDEX "Order_codCollected_idx" ON "Order"("codCollected");
CREATE INDEX "Order_wilaya_idx" ON "Order"("wilaya");
CREATE INDEX "Order_deliveredAt_idx" ON "Order"("deliveredAt");
CREATE INDEX "Order_confirmedAt_idx" ON "Order"("confirmedAt");
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_source_sourceOrderId_key" ON "Order"("source", "sourceOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
