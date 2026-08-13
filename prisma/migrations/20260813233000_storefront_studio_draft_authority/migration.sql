ALTER TABLE "StorefrontConfig" ADD COLUMN "draftName" TEXT;
ALTER TABLE "StorefrontConfig" ADD COLUMN "draftSlug" TEXT;
ALTER TABLE "StorefrontConfig" ADD COLUMN "draftDescription" TEXT;
ALTER TABLE "StorefrontConfig" ADD COLUMN "draftTheme" TEXT;
ALTER TABLE "StorefrontConfig" ADD COLUMN "draftProductIds" TEXT;
ALTER TABLE "StorefrontConfig" ADD COLUMN "draftIsActive" BOOLEAN;
ALTER TABLE "StorefrontConfig" ADD COLUMN "draftUpdatedAt" DATETIME;
