-- Session 2: additive business-truth persistence foundation.
--
-- These tables do not replace legacy Order.status, Product.stock, COD booleans,
-- Refund or OrderChange readers yet. They establish the append-only command,
-- event, movement, outbox and compensation authority required for a compatible
-- migration. Contraction is deliberately deferred until parity and recovery
-- evidence exist.

CREATE TABLE "BusinessAggregateVersion" (
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("aggregateType", "aggregateId")
);

CREATE TABLE "BusinessCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "resultJson" TEXT,
    "actor" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "expectedVersion" INTEGER NOT NULL,
    "committedVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" DATETIME,

    CONSTRAINT "BusinessCommand_status_check"
        CHECK ("status" IN ('processing', 'committed')),
    CONSTRAINT "BusinessCommand_expectedVersion_check"
        CHECK ("expectedVersion" >= 0),
    CONSTRAINT "BusinessCommand_committedVersion_check"
        CHECK ("committedVersion" IS NULL OR "committedVersion" > 0)
);

CREATE UNIQUE INDEX "BusinessCommand_idempotencyKey_key"
    ON "BusinessCommand"("idempotencyKey");
CREATE INDEX "BusinessCommand_aggregate_createdAt_idx"
    ON "BusinessCommand"("aggregateType", "aggregateId", "createdAt");
CREATE INDEX "BusinessCommand_commandType_createdAt_idx"
    ON "BusinessCommand"("commandType", "createdAt");

CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_commandId_fkey"
        FOREIGN KEY ("commandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DomainEvent_version_check"
        CHECK ("aggregateVersion" > 0)
);

CREATE UNIQUE INDEX "DomainEvent_eventKey_key" ON "DomainEvent"("eventKey");
CREATE INDEX "DomainEvent_aggregate_version_idx"
    ON "DomainEvent"("aggregateType", "aggregateId", "aggregateVersion");
CREATE INDEX "DomainEvent_commandId_idx" ON "DomainEvent"("commandId");

CREATE TABLE "OutboxIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "effectKey" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "effectType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxIntent_commandId_fkey"
        FOREIGN KEY ("commandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboxIntent_status_check"
        CHECK ("status" IN ('queued', 'processing', 'retrying', 'succeeded', 'failed', 'dead_letter')),
    CONSTRAINT "OutboxIntent_attemptCount_check"
        CHECK ("attemptCount" >= 0)
);

CREATE UNIQUE INDEX "OutboxIntent_effectKey_key" ON "OutboxIntent"("effectKey");
CREATE INDEX "OutboxIntent_status_nextAttemptAt_idx"
    ON "OutboxIntent"("status", "nextAttemptAt");
CREATE INDEX "OutboxIntent_commandId_idx" ON "OutboxIntent"("commandId");

CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "createdByCommandId" TEXT NOT NULL,
    "closedByCommandId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,

    CONSTRAINT "InventoryReservation_createdByCommandId_fkey"
        FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_closedByCommandId_fkey"
        FOREIGN KEY ("closedByCommandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "InventoryReservation_state_check"
        CHECK ("state" IN ('active', 'released', 'consumed', 'cancelled'))
);

CREATE UNIQUE INDEX "InventoryReservation_reservationKey_key"
    ON "InventoryReservation"("reservationKey");
CREATE INDEX "InventoryReservation_order_state_idx"
    ON "InventoryReservation"("orderId", "state");
CREATE INDEX "InventoryReservation_product_state_idx"
    ON "InventoryReservation"("productId", "productVariantId", "state");

CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movementKey" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "reservationId" TEXT,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "movementType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fromPosition" TEXT,
    "toPosition" TEXT,
    "reason" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_commandId_fkey"
        FOREIGN KEY ("commandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_reservationId_fkey"
        FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "InventoryMovement_movementKey_key"
    ON "InventoryMovement"("movementKey");
CREATE INDEX "InventoryMovement_product_occurredAt_idx"
    ON "InventoryMovement"("productId", "productVariantId", "occurredAt");
CREATE INDEX "InventoryMovement_order_occurredAt_idx"
    ON "InventoryMovement"("orderId", "occurredAt");
CREATE INDEX "InventoryMovement_commandId_idx" ON "InventoryMovement"("commandId");

CREATE TABLE "FinancialMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movementKey" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "orderId" TEXT,
    "settlementId" TEXT,
    "movementType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "counterparty" TEXT,
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialMovement_commandId_fkey"
        FOREIGN KEY ("commandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialMovement_amount_check" CHECK ("amount" <> 0),
    CONSTRAINT "FinancialMovement_currency_check" CHECK ("currency" = 'DZD')
);

CREATE UNIQUE INDEX "FinancialMovement_movementKey_key"
    ON "FinancialMovement"("movementKey");
CREATE INDEX "FinancialMovement_order_occurredAt_idx"
    ON "FinancialMovement"("orderId", "occurredAt");
CREATE INDEX "FinancialMovement_settlement_occurredAt_idx"
    ON "FinancialMovement"("settlementId", "occurredAt");
CREATE INDEX "FinancialMovement_commandId_idx" ON "FinancialMovement"("commandId");

CREATE TABLE "ProjectionInvalidation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commandId" TEXT NOT NULL,
    "projectionKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectionInvalidation_commandId_fkey"
        FOREIGN KEY ("commandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectionInvalidation_command_projection_key"
    ON "ProjectionInvalidation"("commandId", "projectionKey");
CREATE INDEX "ProjectionInvalidation_projection_createdAt_idx"
    ON "ProjectionInvalidation"("projectionKey", "createdAt");

CREATE TABLE "CompensationFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factKey" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompensationFact_commandId_fkey"
        FOREIGN KEY ("commandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompensationFact_factKey_key" ON "CompensationFact"("factKey");
CREATE INDEX "CompensationFact_commandId_idx" ON "CompensationFact"("commandId");
