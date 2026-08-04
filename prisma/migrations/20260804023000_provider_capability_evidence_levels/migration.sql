-- Phase 3 Task 6: distinguish connection verification from capability evidence.

UPDATE "ProviderCapabilityCertification"
SET "status" = CASE
      WHEN "provider" = 'noest' THEN 'uncertified'
      ELSE 'source_reviewed'
    END,
    "reasonCode" = CASE
      WHEN "provider" = 'noest' THEN 'provider_contract_unverified'
      ELSE 'connection_probe_only'
    END,
    "certifiedAt" = NULL,
    "expiresAt" = NULL,
    "disabledAt" = CASE
      WHEN "provider" = 'noest' THEN CURRENT_TIMESTAMP
      ELSE NULL
    END
WHERE "capability" IN ('fees', 'booking', 'tracking')
  AND "status" = 'certified';

UPDATE "ProviderCapabilityCertification"
SET "status" = 'uncertified',
    "reasonCode" = 'provider_contract_unverified',
    "certifiedAt" = NULL,
    "expiresAt" = NULL,
    "disabledAt" = CURRENT_TIMESTAMP
WHERE "provider" = 'noest';
