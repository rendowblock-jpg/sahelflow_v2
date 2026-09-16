-- FD-061 EX-4 (slice 5): per-product landing pages.
-- Contracts extracted from CodFlow (github.com/bighadj22/codflow @ 00f18fa,
-- Apache-2.0). Per-product marketing page (slug, image stack, spacing);
-- views counter, attributed orders (sourceDetails.landingPageSlug),
-- revenue (product price only), CVR = orders/views (null at zero views);
-- duplicate = fresh draft with zeroed counters sharing immutable image
-- objects; image deletes are reference-counted.

CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storefrontSlug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "imageGap" INTEGER NOT NULL DEFAULT 0,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");
CREATE INDEX "LandingPage_storefrontSlug_status_idx" ON "LandingPage"("storefrontSlug", "status");
CREATE INDEX "LandingPage_productId_idx" ON "LandingPage"("productId");

CREATE TABLE "LandingPageImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "landingPageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LandingPageImage_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LandingPageImage_landingPageId_position_idx" ON "LandingPageImage"("landingPageId", "position");
CREATE INDEX "LandingPageImage_url_idx" ON "LandingPageImage"("url");
