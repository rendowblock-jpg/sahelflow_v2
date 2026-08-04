-- Phase 4: purpose-separated protected key authority.
--
-- The installation root derives only local wrapping/integrity keys. Random
-- per-shop data, blind-index and secret-store keys are stored here as
-- authenticated wrapped envelopes and can be independently rotated/re-wrapped.

CREATE TABLE "ProtectedKeyAuthority" (
    "purpose" TEXT NOT NULL PRIMARY KEY,
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "keyId" TEXT NOT NULL,
    "wrappingKeyId" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProtectedKeyAuthority_keyId_key"
ON "ProtectedKeyAuthority"("keyId");
