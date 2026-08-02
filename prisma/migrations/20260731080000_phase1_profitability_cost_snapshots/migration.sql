-- Immutable product-cost authority for governed profitability.
-- A snapshot is created in the same SQLite transaction as the delivered COD
-- receivable, so later catalog edits cannot rewrite historical COGS.

CREATE TABLE "ProfitabilityCostSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotKey" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT,
    "productVariantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "costBasis" TEXT NOT NULL,
    "isExact" BOOLEAN NOT NULL DEFAULT true,
    "recognizedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfitabilityCostSnapshot_orderItemId_fkey"
      FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfitabilityCostSnapshot_quantity_check"
      CHECK ("quantity" > 0),
    CONSTRAINT "ProfitabilityCostSnapshot_unitCost_check"
      CHECK ("unitCost" IS NULL OR "unitCost" >= 0),
    CONSTRAINT "ProfitabilityCostSnapshot_basis_check"
      CHECK ("costBasis" IN (
        'delivery_catalog_cost_v1',
        'delivery_missing_catalog_cost_v1',
        'legacy_backfill_current_catalog_v1',
        'legacy_backfill_missing_catalog_cost_v1'
      ))
);

CREATE UNIQUE INDEX "ProfitabilityCostSnapshot_snapshotKey_key"
  ON "ProfitabilityCostSnapshot"("snapshotKey");
CREATE UNIQUE INDEX "ProfitabilityCostSnapshot_orderItemId_key"
  ON "ProfitabilityCostSnapshot"("orderItemId");
CREATE INDEX "ProfitabilityCostSnapshot_orderId_recognizedAt_idx"
  ON "ProfitabilityCostSnapshot"("orderId", "recognizedAt");
CREATE INDEX "ProfitabilityCostSnapshot_commandId_idx"
  ON "ProfitabilityCostSnapshot"("commandId");

-- Backfill already-delivered canonical receipts. Historical current catalog cost
-- is usable as a compatibility estimate but is explicitly not exact.
INSERT OR IGNORE INTO "ProfitabilityCostSnapshot" (
  "id", "snapshotKey", "commandId", "orderId", "orderItemId",
  "productId", "productVariantId", "quantity", "unitCost", "costBasis",
  "isExact", "recognizedAt", "createdAt"
)
SELECT
  lower(hex(randomblob(16))),
  fm."movementKey" || ':cost:' || oi."id",
  fm."commandId",
  fm."orderId",
  oi."id",
  oi."productId",
  oi."productVariantId",
  oi."quantity",
  p."cost",
  CASE
    WHEN p."cost" IS NULL THEN 'legacy_backfill_missing_catalog_cost_v1'
    ELSE 'legacy_backfill_current_catalog_v1'
  END,
  0,
  fm."occurredAt",
  CURRENT_TIMESTAMP
FROM "FinancialMovement" fm
JOIN "OrderItem" oi ON oi."orderId" = fm."orderId"
LEFT JOIN "Product" p ON p."id" = oi."productId"
WHERE fm."movementType" = 'cod_receivable_created'
  AND fm."orderId" IS NOT NULL;

-- New delivery receipts snapshot catalog cost atomically with revenue authority.
CREATE TRIGGER "ProfitabilityCostSnapshot_after_cod_receivable"
AFTER INSERT ON "FinancialMovement"
WHEN NEW."movementType" = 'cod_receivable_created'
 AND NEW."orderId" IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO "ProfitabilityCostSnapshot" (
    "id", "snapshotKey", "commandId", "orderId", "orderItemId",
    "productId", "productVariantId", "quantity", "unitCost", "costBasis",
    "isExact", "recognizedAt", "createdAt"
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW."movementKey" || ':cost:' || oi."id",
    NEW."commandId",
    NEW."orderId",
    oi."id",
    oi."productId",
    oi."productVariantId",
    oi."quantity",
    p."cost",
    CASE
      WHEN p."cost" IS NULL THEN 'delivery_missing_catalog_cost_v1'
      ELSE 'delivery_catalog_cost_v1'
    END,
    CASE WHEN p."cost" IS NULL THEN 0 ELSE 1 END,
    NEW."occurredAt",
    CURRENT_TIMESTAMP
  FROM "OrderItem" oi
  LEFT JOIN "Product" p ON p."id" = oi."productId"
  WHERE oi."orderId" = NEW."orderId";
END;

CREATE TRIGGER "ProfitabilityCostSnapshot_append_only_update"
BEFORE UPDATE ON "ProfitabilityCostSnapshot"
BEGIN
  SELECT RAISE(ABORT, 'ProfitabilityCostSnapshot is append-only');
END;
