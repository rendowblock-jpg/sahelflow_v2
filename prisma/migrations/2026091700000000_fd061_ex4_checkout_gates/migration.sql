-- FD-061 EX-4 (slice 6): checkout bot/phone gates.
-- Contracts extracted from CodFlow (github.com/bighadj22/codflow @ 00f18fa,
-- Apache-2.0). Per-storefront gate configuration for Cloudflare Turnstile
-- and WhatsApp OTP (dzverify) verification. Missing/disabled rows are
-- inert. Secrets ride the encrypted Secret authority, never this row.

CREATE TABLE "StorefrontGateConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storefrontSlug" TEXT NOT NULL,
    "otpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "otpLanguage" TEXT NOT NULL DEFAULT 'ar',
    "turnstileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "turnstileSiteKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "StorefrontGateConfig_storefrontSlug_key" ON "StorefrontGateConfig"("storefrontSlug");
CREATE INDEX "StorefrontGateConfig_storefrontSlug_idx" ON "StorefrontGateConfig"("storefrontSlug");
