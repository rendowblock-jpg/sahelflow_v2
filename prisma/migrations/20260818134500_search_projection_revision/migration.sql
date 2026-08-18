CREATE TABLE "SearchProjectionRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revision" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "SearchProjectionRevision" ("id", "revision") VALUES ('global', 0);

CREATE TRIGGER "search_projection_customer_insert"
AFTER INSERT ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_customer_update"
AFTER UPDATE ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_customer_delete"
AFTER DELETE ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_product_insert"
AFTER INSERT ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_product_update"
AFTER UPDATE ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_product_delete"
AFTER DELETE ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_order_insert"
AFTER INSERT ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_order_update"
AFTER UPDATE ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_order_delete"
AFTER DELETE ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_delivery_insert"
AFTER INSERT ON "Delivery"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_delivery_update"
AFTER UPDATE ON "Delivery"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_delivery_delete"
AFTER DELETE ON "Delivery"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_return_insert"
AFTER INSERT ON "Return"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_return_update"
AFTER UPDATE ON "Return"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_return_delete"
AFTER DELETE ON "Return"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_conversation_insert"
AFTER INSERT ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_conversation_update"
AFTER UPDATE ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;

CREATE TRIGGER "search_projection_conversation_delete"
AFTER DELETE ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'global';
END;
