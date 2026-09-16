-- FD-061 EX-4 (slice 2): order-verified product reviews.
-- Contracts extracted from CodFlow (github.com/bighadj22/codflow @ 00f18fa,
-- Apache-2.0). One review per real order (UNIQUE orderId); moderation
-- lifecycle pending -> approved | rejected; the buyer-facing surface
-- identifies the order by (orderNumber, phone) — the storefront never
-- exposes order UUIDs.

CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storefrontSlug" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductReview_orderId_key" ON "ProductReview"("orderId");
CREATE INDEX "ProductReview_productId_status_submittedAt_idx" ON "ProductReview"("productId", "status", "submittedAt");
CREATE INDEX "ProductReview_storefrontSlug_status_idx" ON "ProductReview"("storefrontSlug", "status");
