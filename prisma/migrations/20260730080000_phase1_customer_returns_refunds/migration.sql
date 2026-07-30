-- Phase 1E: customer-requested returns, exchanges, refunds and refund reversals.
--
-- CanonicalReturnCase.currentState and Order.returnState/refundState remain mutable
-- projections. Requested quantities, replacement selections, inspections, refunds,
-- reversals and exchange-order links are append-only business facts.

CREATE TABLE "CanonicalReturnItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemKey" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productVariantId" TEXT,
  "quantity" INTEGER NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalReturnItem_return_fkey"
    FOREIGN KEY ("returnId") REFERENCES "CanonicalReturnCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnItem_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnItem_orderItem_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnItem_product_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnItem_variant_fkey"
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnItem_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnItem_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "CanonicalReturnItem_itemKey_key" ON "CanonicalReturnItem"("itemKey");
CREATE UNIQUE INDEX "CanonicalReturnItem_returnId_orderItemId_key" ON "CanonicalReturnItem"("returnId", "orderItemId");
CREATE INDEX "CanonicalReturnItem_orderId_createdAt_idx" ON "CanonicalReturnItem"("orderId", "createdAt");
CREATE INDEX "CanonicalReturnItem_product_variant_idx" ON "CanonicalReturnItem"("productId", "productVariantId");
CREATE INDEX "CanonicalReturnItem_createdByCommandId_idx" ON "CanonicalReturnItem"("createdByCommandId");

CREATE TABLE "CanonicalExchangeRequestItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemKey" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productVariantId" TEXT,
  "productName" TEXT NOT NULL,
  "productVariantName" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalExchangeRequestItem_return_fkey"
    FOREIGN KEY ("returnId") REFERENCES "CanonicalReturnCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeRequestItem_product_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeRequestItem_variant_fkey"
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeRequestItem_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeRequestItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "CanonicalExchangeRequestItem_price_check" CHECK ("unitPrice" >= 0)
);

CREATE UNIQUE INDEX "CanonicalExchangeRequestItem_itemKey_key" ON "CanonicalExchangeRequestItem"("itemKey");
CREATE INDEX "CanonicalExchangeRequestItem_returnId_createdAt_idx" ON "CanonicalExchangeRequestItem"("returnId", "createdAt");
CREATE INDEX "CanonicalExchangeRequestItem_product_variant_idx" ON "CanonicalExchangeRequestItem"("productId", "productVariantId");
CREATE INDEX "CanonicalExchangeRequestItem_createdByCommandId_idx" ON "CanonicalExchangeRequestItem"("createdByCommandId");

CREATE TABLE "CanonicalRefund" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "refundKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "returnId" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'DZD',
  "method" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reference" TEXT,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalRefund_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalRefund_return_fkey"
    FOREIGN KEY ("returnId") REFERENCES "CanonicalReturnCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalRefund_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalRefund_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "CanonicalRefund_currency_check" CHECK ("currency" = 'DZD'),
  CONSTRAINT "CanonicalRefund_method_check" CHECK ("method" IN ('cash', 'bank', 'credit', 'courier_deduction'))
);

CREATE UNIQUE INDEX "CanonicalRefund_refundKey_key" ON "CanonicalRefund"("refundKey");
CREATE UNIQUE INDEX "CanonicalRefund_createdByCommandId_key" ON "CanonicalRefund"("createdByCommandId");
CREATE INDEX "CanonicalRefund_orderId_occurredAt_idx" ON "CanonicalRefund"("orderId", "occurredAt");
CREATE INDEX "CanonicalRefund_returnId_occurredAt_idx" ON "CanonicalRefund"("returnId", "occurredAt");
CREATE INDEX "CanonicalRefund_method_occurredAt_idx" ON "CanonicalRefund"("method", "occurredAt");

CREATE TABLE "CanonicalRefundReversal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reversalKey" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalRefundReversal_refund_fkey"
    FOREIGN KEY ("refundId") REFERENCES "CanonicalRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalRefundReversal_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalRefundReversal_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "CanonicalRefundReversal_reversalKey_key" ON "CanonicalRefundReversal"("reversalKey");
CREATE UNIQUE INDEX "CanonicalRefundReversal_createdByCommandId_key" ON "CanonicalRefundReversal"("createdByCommandId");
CREATE INDEX "CanonicalRefundReversal_refundId_occurredAt_idx" ON "CanonicalRefundReversal"("refundId", "occurredAt");

CREATE TABLE "CanonicalExchangeOrder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "exchangeKey" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "sourceOrderId" TEXT NOT NULL,
  "replacementOrderId" TEXT NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalExchangeOrder_return_fkey"
    FOREIGN KEY ("returnId") REFERENCES "CanonicalReturnCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeOrder_source_order_fkey"
    FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeOrder_replacement_order_fkey"
    FOREIGN KEY ("replacementOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalExchangeOrder_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CanonicalExchangeOrder_exchangeKey_key" ON "CanonicalExchangeOrder"("exchangeKey");
CREATE UNIQUE INDEX "CanonicalExchangeOrder_returnId_key" ON "CanonicalExchangeOrder"("returnId");
CREATE UNIQUE INDEX "CanonicalExchangeOrder_replacementOrderId_key" ON "CanonicalExchangeOrder"("replacementOrderId");
CREATE UNIQUE INDEX "CanonicalExchangeOrder_createdByCommandId_key" ON "CanonicalExchangeOrder"("createdByCommandId");
CREATE INDEX "CanonicalExchangeOrder_sourceOrderId_createdAt_idx" ON "CanonicalExchangeOrder"("sourceOrderId", "createdAt");

CREATE TRIGGER "CanonicalReturnItem_append_only_update"
BEFORE UPDATE ON "CanonicalReturnItem"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalReturnItem is append-only');
END;

CREATE TRIGGER "CanonicalExchangeRequestItem_append_only_update"
BEFORE UPDATE ON "CanonicalExchangeRequestItem"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalExchangeRequestItem is append-only');
END;

CREATE TRIGGER "CanonicalRefund_append_only_update"
BEFORE UPDATE ON "CanonicalRefund"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalRefund is append-only; append a reversal');
END;

CREATE TRIGGER "CanonicalRefundReversal_append_only_update"
BEFORE UPDATE ON "CanonicalRefundReversal"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalRefundReversal is append-only');
END;

CREATE TRIGGER "CanonicalExchangeOrder_append_only_update"
BEFORE UPDATE ON "CanonicalExchangeOrder"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalExchangeOrder is append-only');
END;
