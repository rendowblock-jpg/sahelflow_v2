CREATE TABLE "SearchProjectionRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revision" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "SearchProjectionToken" (
    "family" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    PRIMARY KEY ("family", "entityId", "tokenHash")
);

CREATE INDEX "SearchProjectionToken_family_tokenHash_idx"
ON "SearchProjectionToken"("family", "tokenHash");

CREATE TABLE "SearchProjectionDirty" (
    "family" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("family", "entityId")
);

CREATE INDEX "SearchProjectionDirty_family_idx"
ON "SearchProjectionDirty"("family");

-- Runtime refreshes newest committed mutations before the revision-zero upgrade
-- backlog, so ordinary seller activity remains searchable while backfill drains.
CREATE INDEX "SearchProjectionDirty_family_revision_entity_idx"
ON "SearchProjectionDirty"("family", "revision" DESC, "entityId" ASC);

INSERT INTO "SearchProjectionRevision" ("id", "revision") VALUES
  ('customer', 0),
  ('product', 0),
  ('order', 0),
  ('delivery', 0),
  ('return', 0),
  ('conversation', 0);

-- Existing protected customers and orders are queued once for persistent
-- keyed-token backfill. Runtime refresh processes bounded batches and continues
-- serving whatever has already been indexed; the upgrade backlog never becomes
-- a global availability prerequisite.
INSERT OR IGNORE INTO "SearchProjectionDirty" ("family", "entityId", "revision")
SELECT 'customer', "id", 0 FROM "Customer";

INSERT OR IGNORE INTO "SearchProjectionDirty" ("family", "entityId", "revision")
SELECT 'order', "id", 0 FROM "Order";

-- Revisions and dirty rows are advanced by SQLite inside the authoritative
-- transaction. A rollback therefore rolls both back; a committed mutation and
-- its projection generation become visible atomically to the search authority.
CREATE TRIGGER "search_projection_customer_insert"
AFTER INSERT ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'customer';
  INSERT INTO "SearchProjectionDirty" ("family", "entityId", "revision")
  VALUES (
    'customer',
    NEW."id",
    (SELECT "revision" FROM "SearchProjectionRevision" WHERE "id" = 'customer')
  )
  ON CONFLICT("family", "entityId") DO UPDATE
  SET "revision" = excluded."revision";
END;

CREATE TRIGGER "search_projection_customer_update"
AFTER UPDATE OF "name", "phone", "wilaya", "commune", "deletedAt" ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'customer';
  INSERT INTO "SearchProjectionDirty" ("family", "entityId", "revision")
  VALUES (
    'customer',
    NEW."id",
    (SELECT "revision" FROM "SearchProjectionRevision" WHERE "id" = 'customer')
  )
  ON CONFLICT("family", "entityId") DO UPDATE
  SET "revision" = excluded."revision";
END;

CREATE TRIGGER "search_projection_customer_delete"
AFTER DELETE ON "Customer"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'customer';
  INSERT INTO "SearchProjectionDirty" ("family", "entityId", "revision")
  VALUES (
    'customer',
    OLD."id",
    (SELECT "revision" FROM "SearchProjectionRevision" WHERE "id" = 'customer')
  )
  ON CONFLICT("family", "entityId") DO UPDATE
  SET "revision" = excluded."revision";
END;

CREATE TRIGGER "search_projection_product_insert"
AFTER INSERT ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'product';
END;

CREATE TRIGGER "search_projection_product_update"
AFTER UPDATE OF "name", "sku", "deletedAt" ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'product';
END;

CREATE TRIGGER "search_projection_product_delete"
AFTER DELETE ON "Product"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'product';
END;

-- Order-number search is persistent/incremental. Inserts, searchable-field
-- updates, and deletes enqueue only the affected order instead of invalidating an
-- in-memory full-table index. The same conflict-safe upsert avoids concurrent
-- protected/order upsert races on (family, entityId).
CREATE TRIGGER "search_projection_order_insert"
AFTER INSERT ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'order';
  INSERT INTO "SearchProjectionDirty" ("family", "entityId", "revision")
  VALUES (
    'order',
    NEW."id",
    (SELECT "revision" FROM "SearchProjectionRevision" WHERE "id" = 'order')
  )
  ON CONFLICT("family", "entityId") DO UPDATE
  SET "revision" = excluded."revision";
END;

CREATE TRIGGER "search_projection_order_update"
AFTER UPDATE OF "orderNumber", "deletedAt" ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'order';
  INSERT INTO "SearchProjectionDirty" ("family", "entityId", "revision")
  VALUES (
    'order',
    NEW."id",
    (SELECT "revision" FROM "SearchProjectionRevision" WHERE "id" = 'order')
  )
  ON CONFLICT("family", "entityId") DO UPDATE
  SET "revision" = excluded."revision";
END;

-- Delivery and return search projections include the related order number, so
-- only an actual order-number change invalidates those two derived families.
CREATE TRIGGER "search_projection_order_number_update"
AFTER UPDATE OF "orderNumber" ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" IN ('delivery', 'return');
END;

CREATE TRIGGER "search_projection_order_delete"
AFTER DELETE ON "Order"
BEGIN
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" = 'order';
  INSERT INTO "SearchProjectionDirty" ("family", "entityId", "revision")
  VALUES (
    'order',
    OLD."id",
    (SELECT "revision" FROM "SearchProjectionRevision" WHERE "id" = 'order')
  )
  ON CONFLICT("family", "entityId") DO UPDATE
  SET "revision" = excluded."revision";
  UPDATE "SearchProjectionRevision"
  SET "revision" = "revision" + 1
  WHERE "id" IN ('delivery', 'return');
END;

CREATE TRIGGER "search_projection_delivery_insert"
AFTER INSERT ON "Delivery"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'delivery';
END;

CREATE TRIGGER "search_projection_delivery_update"
AFTER UPDATE OF "provider", "trackingNumber", "orderId", "deletedAt" ON "Delivery"
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
AFTER UPDATE OF "type", "status", "orderId", "deletedAt" ON "Return"
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
AFTER UPDATE OF "channel", "contactName", "contactPhone", "lastMessageAt" ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'conversation';
END;

CREATE TRIGGER "search_projection_conversation_delete"
AFTER DELETE ON "Conversation"
BEGIN
  UPDATE "SearchProjectionRevision" SET "revision" = "revision" + 1 WHERE "id" = 'conversation';
END;
