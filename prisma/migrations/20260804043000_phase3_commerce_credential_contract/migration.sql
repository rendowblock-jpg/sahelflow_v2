-- Phase 3 Task 6: bind each provider-page run to one exact credential
-- and endpoint contract without changing canonical commerce source identity.

ALTER TABLE "CommerceSyncRun"
  ADD COLUMN "credentialFingerprint" TEXT NOT NULL DEFAULT '';

ALTER TABLE "CommerceSyncRun"
  ADD COLUMN "endpointFingerprint" TEXT NOT NULL DEFAULT '';
