-- Governed adoption may mark a historical manual order as trusted only when
-- every item already has an exact, currently valid catalog identity.
--
-- A null variant is safe only for a product that has no variant rows at all.
-- If variants exist, adoption must identify one exact active variant belonging
-- to that product. This prevents parent-stock deduction from being overwritten
-- later by the variant availability projection.

CREATE TRIGGER IF NOT EXISTS "Order_guard_trusted_manual_adoption_identity"
BEFORE UPDATE OF "sourceMetadata" ON "Order"
FOR EACH ROW
WHEN instr(COALESCE(NEW."sourceMetadata", ''), 'trusted-manual-v1') > 0
  AND instr(COALESCE(OLD."sourceMetadata", ''), 'trusted-manual-v1') = 0
  AND EXISTS (
    SELECT 1
    FROM "OrderItem" item
    WHERE item."orderId" = OLD."id"
      AND (
        item."productId" IS NULL
        OR (
          item."productVariantId" IS NULL
          AND EXISTS (
            SELECT 1
            FROM "ProductVariant" variant
            WHERE variant."productId" = item."productId"
          )
        )
        OR (
          item."productVariantId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "ProductVariant" variant
            WHERE variant."id" = item."productVariantId"
              AND variant."productId" = item."productId"
              AND variant."isActive" = 1
          )
        )
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'legacy manual adoption requires exact active catalog identity');
END;
