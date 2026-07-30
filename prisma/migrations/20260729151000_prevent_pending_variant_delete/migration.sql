-- A pending order snapshots one exact variant identity. Deleting that variant
-- would null OrderItem.productVariantId through the foreign key and could make
-- canonical confirmation fall back to parent-product stock. Refuse the delete
-- until every referencing order has left the draft/pending intake states.
CREATE TRIGGER "prevent_pending_order_variant_delete"
BEFORE DELETE ON "ProductVariant"
WHEN EXISTS (
  SELECT 1
  FROM "OrderItem" AS "item"
  INNER JOIN "Order" AS "order" ON "order"."id" = "item"."orderId"
  WHERE "item"."productVariantId" = OLD."id"
    AND "order"."deletedAt" IS NULL
    AND "order"."status" IN ('draft', 'pending')
)
BEGIN
  SELECT RAISE(
    ABORT,
    'Cannot delete a product variant referenced by a draft or pending order'
  );
END;
