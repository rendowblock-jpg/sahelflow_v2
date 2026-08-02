-- Phase 1E: durable exchange agreement header.
-- Replacement item and price snapshots live in CanonicalExchangeRequestItem;
-- this header preserves the agreed replacement delivery charge.

CREATE TABLE "CanonicalExchangeRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestKey" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "deliveryCost" INTEGER NOT NULL DEFAULT 0,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalExchangeRequest_return_fkey"
    FOREIGN KEY ("returnId") REFERENCES "CanonicalReturnCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeRequest_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeRequest_delivery_cost_check" CHECK ("deliveryCost" >= 0)
);

CREATE UNIQUE INDEX "CanonicalExchangeRequest_requestKey_key" ON "CanonicalExchangeRequest"("requestKey");
CREATE UNIQUE INDEX "CanonicalExchangeRequest_returnId_key" ON "CanonicalExchangeRequest"("returnId");
CREATE UNIQUE INDEX "CanonicalExchangeRequest_createdByCommandId_key" ON "CanonicalExchangeRequest"("createdByCommandId");

CREATE TRIGGER "CanonicalExchangeRequest_append_only_update"
BEFORE UPDATE ON "CanonicalExchangeRequest"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalExchangeRequest is append-only');
END;
