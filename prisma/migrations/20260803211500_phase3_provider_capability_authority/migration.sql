CREATE TABLE "ProviderCapabilityCertification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "credentialFingerprint" TEXT NOT NULL,
    "endpointFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uncertified',
    "certifiedBy" TEXT,
    "reasonCode" TEXT,
    "evidenceJson" TEXT,
    "lastCheckedAt" DATETIME,
    "certifiedAt" DATETIME,
    "expiresAt" DATETIME,
    "disabledAt" DATETIME,
    "lastErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProviderCapabilityCertification_provider_capability_key"
ON "ProviderCapabilityCertification"("provider", "capability");

CREATE INDEX "ProviderCapabilityCertification_provider_status_idx"
ON "ProviderCapabilityCertification"("provider", "status");

CREATE INDEX "ProviderCapabilityCertification_status_expiresAt_idx"
ON "ProviderCapabilityCertification"("status", "expiresAt");

-- Remove credentials for the retired undocumented DHD adapter. Historical
-- delivery rows keep their original provider identity for audit, but no runtime
-- adapter or effect authority remains registered for them.
DELETE FROM "Secret" WHERE "key" LIKE 'delivery_dhd_%';

UPDATE "Delivery"
SET "status" = 'reconciliation_required',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "provider" = 'dhd'
  AND "deletedAt" IS NULL
  AND "status" NOT IN ('delivered', 'returned', 'refused', 'failed');
