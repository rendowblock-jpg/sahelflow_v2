export const LICENSE_ENTITLEMENT_DOMAIN = "sahelflow.license.entitlement.v2" as const;
export const LICENSE_ENTITLEMENT_FORMAT = 2 as const;

type CanonicalClaims = Readonly<{
  domain: string;
  formatVersion: number;
  licenseId: string;
  workspaceId: string;
  installationId: string;
  deviceBinding: string;
  productMajor: number;
  type: string;
  issuedAt: string;
  expiresAt: string | null;
  supportEndsAt: string;
  shopSlots: number;
  memberLimit: number;
  deviceLimit: number;
  backupBytes: number;
  mediaBytes: number;
  features: readonly string[];
  transferState: string;
  transferEpoch: number;
  recoveryEpoch: number;
  revocationEpoch: number;
  keyId: string;
  issuer: string;
}>;

export function canonicalEntitlementBytes(claims: CanonicalClaims): Uint8Array {
  const canonical = [
    claims.domain,
    claims.formatVersion,
    claims.licenseId,
    claims.workspaceId,
    claims.installationId,
    claims.deviceBinding,
    claims.productMajor,
    claims.type,
    claims.issuedAt,
    claims.expiresAt,
    claims.supportEndsAt,
    claims.shopSlots,
    claims.memberLimit,
    claims.deviceLimit,
    claims.backupBytes,
    claims.mediaBytes,
    [...claims.features].sort(),
    claims.transferState,
    claims.transferEpoch,
    claims.recoveryEpoch,
    claims.revocationEpoch,
    claims.keyId,
    claims.issuer,
  ] as const;
  return new TextEncoder().encode(JSON.stringify(canonical));
}
