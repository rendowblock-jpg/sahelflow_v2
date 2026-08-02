import "server-only";

import {
  getLicenseAuthorityProjection,
  requireLicenseEntitlement,
} from "./license-authority";

export const FEATURE_KEYS = {
  AI_CHAT: "ai_chat",
  WHATSAPP: "whatsapp",
  AUTOMATIONS: "automations",
  REPORTS: "reports",
  COMPLETE: "sahelflow.complete",
} as const;

export async function isLicenseValid(): Promise<boolean> {
  return (await getLicenseAuthorityProjection()).status === "valid";
}

export async function requireLicense(): Promise<void> {
  await requireLicenseEntitlement();
}

export async function hasFeature(feature: string): Promise<boolean> {
  const authority = await getLicenseAuthorityProjection();
  return (
    authority.status === "valid" &&
    (authority.features.includes(feature) || authority.features.includes(FEATURE_KEYS.COMPLETE))
  );
}
