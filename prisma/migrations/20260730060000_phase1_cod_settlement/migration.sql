-- Phase 1D: append-only COD collection, remittance batch, line, correction and matching facts.
--
-- Existing Order.cod* columns remain compatibility projections. Canonical money
-- authority is the delivered receivable FinancialMovement plus these immutable
-- collection/settlement facts and explicit correction/reconciliation rows.

CREATE TABLE "CodCollection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "collectionKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'DZD',
  "reference" TEXT,
  "collectedAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodCollection_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCollection_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCollection_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "CodCollection_currency_check" CHECK ("currency" = 'DZD')
);

CREATE UNIQUE INDEX "CodCollection_collectionKey_key" ON "CodCollection"("collectionKey");
CREATE UNIQUE INDEX "CodCollection_orderId_key" ON "CodCollection"("orderId");
CREATE UNIQUE INDEX "CodCollection_createdByCommandId_key" ON "CodCollection"("createdByCommandId");
CREATE INDEX "CodCollection_provider_collectedAt_idx" ON "CodCollection"("provider", "collectedAt");

CREATE TABLE "CodCollectionCorrection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "correctionKey" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "amountDelta" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodCollectionCorrection_collection_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "CodCollection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCollectionCorrection_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCollectionCorrection_delta_check" CHECK ("amountDelta" <> 0)
);

CREATE UNIQUE INDEX "CodCollectionCorrection_correctionKey_key" ON "CodCollectionCorrection"("correctionKey");
CREATE UNIQUE INDEX "CodCollectionCorrection_createdByCommandId_key" ON "CodCollectionCorrection"("createdByCommandId");
CREATE INDEX "CodCollectionCorrection_collectionId_occurredAt_idx" ON "CodCollectionCorrection"("collectionId", "occurredAt");

CREATE TABLE "CodSettlement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "settlementKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalReference" TEXT NOT NULL,
  "evidenceSha256" TEXT,
  "evidenceName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "currency" TEXT NOT NULL DEFAULT 'DZD',
  "grossAmount" INTEGER NOT NULL,
  "feeAmount" INTEGER NOT NULL,
  "adjustmentAmount" INTEGER NOT NULL,
  "netAmount" INTEGER NOT NULL,
  "discrepancyAmount" INTEGER NOT NULL,
  "unmatchedAmount" INTEGER NOT NULL,
  "receivedAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodSettlement_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlement_status_check" CHECK ("status" IN ('posted', 'needs_review')),
  CONSTRAINT "CodSettlement_currency_check" CHECK ("currency" = 'DZD'),
  CONSTRAINT "CodSettlement_amounts_check" CHECK (
    "grossAmount" >= 0 AND
    "feeAmount" >= 0 AND
    "netAmount" >= 0 AND
    "unmatchedAmount" >= 0 AND
    "netAmount" = "grossAmount" - "feeAmount" + "adjustmentAmount"
  ),
  CONSTRAINT "CodSettlement_evidence_hash_check" CHECK (
    "evidenceSha256" IS NULL OR length("evidenceSha256") = 64
  )
);

CREATE UNIQUE INDEX "CodSettlement_settlementKey_key" ON "CodSettlement"("settlementKey");
CREATE UNIQUE INDEX "CodSettlement_provider_externalReference_key" ON "CodSettlement"("provider", "externalReference");
CREATE UNIQUE INDEX "CodSettlement_createdByCommandId_key" ON "CodSettlement"("createdByCommandId");
CREATE INDEX "CodSettlement_provider_receivedAt_idx" ON "CodSettlement"("provider", "receivedAt");
CREATE INDEX "CodSettlement_status_receivedAt_idx" ON "CodSettlement"("status", "receivedAt");

CREATE TABLE "CodSettlementLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lineKey" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "providerLineReference" TEXT,
  "orderId" TEXT,
  "isFinal" BOOLEAN NOT NULL DEFAULT true,
  "grossRemittedAmount" INTEGER NOT NULL,
  "feeAmount" INTEGER NOT NULL,
  "adjustmentAmount" INTEGER NOT NULL,
  "netAmount" INTEGER NOT NULL,
  "discrepancyAmount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodSettlementLine_settlement_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "CodSettlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementLine_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementLine_status_check" CHECK ("status" IN ('matched', 'partial', 'disputed', 'unmatched')),
  CONSTRAINT "CodSettlementLine_amounts_check" CHECK (
    "grossRemittedAmount" >= 0 AND
    "feeAmount" >= 0 AND
    "netAmount" >= 0 AND
    "netAmount" = "grossRemittedAmount" - "feeAmount" + "adjustmentAmount"
  ),
  CONSTRAINT "CodSettlementLine_authority_check" CHECK (
    ("orderId" IS NULL AND "status" = 'unmatched') OR
    ("orderId" IS NOT NULL AND "status" IN ('matched', 'partial', 'disputed'))
  ),
  CONSTRAINT "CodSettlementLine_partial_check" CHECK (
    "status" <> 'partial' OR "isFinal" = false
  )
);

CREATE UNIQUE INDEX "CodSettlementLine_lineKey_key" ON "CodSettlementLine"("lineKey");
CREATE UNIQUE INDEX "CodSettlementLine_settlementId_providerLineReference_key"
  ON "CodSettlementLine"("settlementId", "providerLineReference");
CREATE UNIQUE INDEX "CodSettlementLine_settlementId_orderId_key"
  ON "CodSettlementLine"("settlementId", "orderId");
CREATE INDEX "CodSettlementLine_orderId_createdAt_idx" ON "CodSettlementLine"("orderId", "createdAt");
CREATE INDEX "CodSettlementLine_settlementId_status_idx" ON "CodSettlementLine"("settlementId", "status");

CREATE TABLE "CodSettlementCorrection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "correctionKey" TEXT NOT NULL,
  "settlementLineId" TEXT NOT NULL,
  "grossDelta" INTEGER NOT NULL,
  "feeDelta" INTEGER NOT NULL,
  "adjustmentDelta" INTEGER NOT NULL,
  "discrepancyDelta" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodSettlementCorrection_line_fkey"
    FOREIGN KEY ("settlementLineId") REFERENCES "CodSettlementLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementCorrection_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementCorrection_delta_check" CHECK (
    "grossDelta" <> 0 OR
    "feeDelta" <> 0 OR
    "adjustmentDelta" <> 0 OR
    "discrepancyDelta" <> 0
  )
);

CREATE UNIQUE INDEX "CodSettlementCorrection_correctionKey_key" ON "CodSettlementCorrection"("correctionKey");
CREATE UNIQUE INDEX "CodSettlementCorrection_createdByCommandId_key" ON "CodSettlementCorrection"("createdByCommandId");
CREATE INDEX "CodSettlementCorrection_settlementLineId_occurredAt_idx"
  ON "CodSettlementCorrection"("settlementLineId", "occurredAt");

CREATE TABLE "CodSettlementLineMatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "matchKey" TEXT NOT NULL,
  "settlementLineId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "discrepancyAmount" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodSettlementLineMatch_line_fkey"
    FOREIGN KEY ("settlementLineId") REFERENCES "CodSettlementLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementLineMatch_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementLineMatch_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementLineMatch_status_check" CHECK ("status" IN ('matched', 'disputed'))
);

CREATE UNIQUE INDEX "CodSettlementLineMatch_matchKey_key" ON "CodSettlementLineMatch"("matchKey");
CREATE UNIQUE INDEX "CodSettlementLineMatch_settlementLineId_key" ON "CodSettlementLineMatch"("settlementLineId");
CREATE UNIQUE INDEX "CodSettlementLineMatch_createdByCommandId_key" ON "CodSettlementLineMatch"("createdByCommandId");
CREATE INDEX "CodSettlementLineMatch_orderId_occurredAt_idx" ON "CodSettlementLineMatch"("orderId", "occurredAt");

-- Canonical settlement facts are immutable. Corrections and matches are appended in
-- dedicated tables; mutable compatibility projections live on Order.
CREATE TRIGGER "CodCollection_append_only_update"
BEFORE UPDATE ON "CodCollection"
BEGIN
  SELECT RAISE(ABORT, 'CodCollection is append-only; create a correction');
END;

CREATE TRIGGER "CodCollectionCorrection_append_only_update"
BEFORE UPDATE ON "CodCollectionCorrection"
BEGIN
  SELECT RAISE(ABORT, 'CodCollectionCorrection is append-only');
END;

CREATE TRIGGER "CodSettlement_append_only_update"
BEFORE UPDATE ON "CodSettlement"
BEGIN
  SELECT RAISE(ABORT, 'CodSettlement is append-only; create a correction');
END;

CREATE TRIGGER "CodSettlementLine_append_only_update"
BEFORE UPDATE ON "CodSettlementLine"
BEGIN
  SELECT RAISE(ABORT, 'CodSettlementLine is append-only; create a correction');
END;

CREATE TRIGGER "CodSettlementCorrection_append_only_update"
BEFORE UPDATE ON "CodSettlementCorrection"
BEGIN
  SELECT RAISE(ABORT, 'CodSettlementCorrection is append-only');
END;

CREATE TRIGGER "CodSettlementLineMatch_append_only_update"
BEFORE UPDATE ON "CodSettlementLineMatch"
BEGIN
  SELECT RAISE(ABORT, 'CodSettlementLineMatch is append-only');
END;
