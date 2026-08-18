CREATE TABLE "SearchProjectionRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revision" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "SearchProjectionRevision" ("id", "revision") VALUES
  ('customer', 0),
  ('product', 0),
  ('order', 0),
  ('delivery', 0),
  ('return', 0),
  ('conversation', 0);

-- These counters are updated by SQLite itself inside the same transaction as
-- the authoritative write. A rollback therefore rolls the revision back, while
-- a commit makes data and cache generation visible atomically.

CREATE TRIGGER "search_projection_customer_insert"
AFTER INSERT ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'customer';
END;

CREATE TRIGGER "search_projection_customer_update"
AFTER UPDATE ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'customer';
END;

CREATE TRIGGER "search_projection_customer_delete"
AFTER DELETE ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'customer';
END;

CREATE TRIGGER "search_projection_product_insert"
AFTER INSERT ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'product';
END;

CREATE TRIGGER "search_projection_product_update"
AFTER UPDATE ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'product';
END;

CREATE TRIGGER "search_projection_product_delete"
AFTER DELETE ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'product';
END;

-- Delivery and return projections carry the canonical order number, so an
-- order mutation invalidates those derived families as well as the order index.
CREATE TRIGGER "search_projection_order_insert"
AFTER INSERT ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" IN ('order', 'delivery', 'return');
END;

CREATE TRIGGER "search_projection_order_update"
AFTER UPDATE ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" IN ('order', 'delivery', 'return');
END;

CREATE TRIGGER "search_projection_order_delete"
AFTER DELETE ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" IN ('order', 'delivery', 'return');
END;

CREATE TRIGGER "search_projection_delivery_insert"
AFTER INSERT ON "Delivery"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'delivery';
END;

CREATE TRIGGER "search_projection_delivery_update"
AFTER UPDATE ON "Delivery"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'delivery';
END;

CREATE TRIGGER "search_projection_delivery_delete"
AFTER DELETE ON "Delivery"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'delivery';
END;

CREATE TRIGGER "search_projection_return_insert"
AFTER INSERT ON "Return"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'return';
END;

CREATE TRIGGER "search_projection_return_update"
AFTER UPDATE ON "Return"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'return';
END;

CREATE TRIGGER "search_projection_return_delete"
AFTER DELETE ON "Return"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'return';
END;

CREATE TRIGGER "search_projection_conversation_insert"
AFTER INSERT ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'conversation';
END;

CREATE TRIGGER "search_projection_conversation_update"
AFTER UPDATE ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'conversation';
END;

CREATE TRIGGER "search_projection_conversation_delete"
AFTER DELETE ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'conversation';
END;
