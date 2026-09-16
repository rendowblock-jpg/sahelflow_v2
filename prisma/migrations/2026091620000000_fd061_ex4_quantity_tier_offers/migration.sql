-- FD-061 EX-4 (slice 3): quantity-tier offers.
-- Contracts extracted from CodFlow (github.com/bighadj22/codflow @ 00f18fa,
-- Apache-2.0). Per-storefront upsell configuration: trigger
-- product/variant/quantity -> reward product/variant/quantity or free
-- shipping; highest trigger wins; reward stock checked at evaluation
-- time. Configuration surface — references are live-validated, no FK
-- chains (the AbandonedCart precedent); the reward line enters the command
-- kernel as a storefront-authoritative unitPrice: 0 item.

CREATE TABLE "QuantityTierOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storefrontSlug" TEXT NOT NULL,
    "triggerProductId" TEXT NOT NULL,
    "triggerVariantId" TEXT,
    "triggerQuantity" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardProductId" TEXT,
    "rewardVariantId" TEXT,
    "rewardQuantity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "QuantityTierOffer_storefrontSlug_isActive_idx" ON "QuantityTierOffer"("storefrontSlug", "isActive");
CREATE INDEX "QuantityTierOffer_triggerProductId_isActive_idx" ON "QuantityTierOffer"("triggerProductId", "isActive");
