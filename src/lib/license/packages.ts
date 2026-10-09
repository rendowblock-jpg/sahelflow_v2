import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
} from "./entitlement-canonical";

/**
 * The SahelFlow 1.0 commercial package (PRODUCT.md §3/§5/§7.5), expressed as
 * the claims a Founder-signed permanent licence grants. One source of truth
 * for the CLI signer and the License Desk, so a paying seller can never be
 * under-entitled by a hand-typed default.
 *
 * - One complete edition, 35,000 DZD one-time; up to five extra shops at
 *   5,000 DZD each (ten shops maximum).
 * - Owner plus ten active team members: 11 members may hold remote devices.
 * - Two personal devices per member plus three owner remote devices:
 *   10 × 2 + 3 = 23 remote devices per workspace.
 * - 20 GB shared encrypted backup, plus 4 GB per extra shop.
 * - Storefront media: 10 GB shared base, plus 2 GB per extra shop.
 * - Five years of same-major maintenance. Stable has not launched yet, so the
 *   horizon is counted from issuance, which is never shorter than the promise
 *   counted from a later Stable date would be at issuance time.
 */
export const PERMANENT_PACKAGE = Object.freeze({
  priceDzd: 35_000,
  extraShopPriceDzd: 5_000,
  includedShops: 5,
  maximumShops: 10,
  memberLimit: 11,
  deviceLimit: 23,
  baseBackupBytes: 20_000_000_000,
  backupBytesPerExtraShop: 4_000_000_000,
  baseMediaBytes: 10_000_000_000,
  mediaBytesPerExtraShop: 2_000_000_000,
  supportMonths: 60,
  features: Object.freeze(["sahelflow.complete"]),
});

export const MAXIMUM_EXTRA_SHOPS =
  PERMANENT_PACKAGE.maximumShops - PERMANENT_PACKAGE.includedShops;

export const DEFAULT_PERMANENT_KEY_ID = "permanent-2026-10";

/** The identifiers a licence request code carries (see request-code.ts). */
export interface PermanentLicenseRequestFacts {
  workspaceId: string;
  installationId: string;
  deviceBinding: string;
  productMajor: number;
  transferEpoch: number;
  revocationEpoch: number;
  recoveryEpoch: number;
}

export interface PermanentLicenseOptions {
  extraShops?: number;
  keyId?: string;
  issuedAt?: Date;
  /** Override for tests; production uses a random identifier. */
  licenseId?: string;
}

function randomLicenseId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `perm-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function packageTotalDzd(extraShops: number): number {
  return PERMANENT_PACKAGE.priceDzd + extraShops * PERMANENT_PACKAGE.extraShopPriceDzd;
}

/**
 * The exact permanent claims for one installation. The caller signs them with
 * the offline permanent key; activation re-validates every field.
 */
export function permanentLicenseClaims(
  request: PermanentLicenseRequestFacts,
  options: PermanentLicenseOptions = {},
) {
  const extraShops = options.extraShops ?? 0;
  if (!Number.isInteger(extraShops) || extraShops < 0 || extraShops > MAXIMUM_EXTRA_SHOPS) {
    throw new RangeError(`extra shops must be an integer from 0 to ${MAXIMUM_EXTRA_SHOPS}`);
  }
  const issuedAt = options.issuedAt ?? new Date();
  const supportEndsAt = new Date(issuedAt);
  supportEndsAt.setUTCMonth(supportEndsAt.getUTCMonth() + PERMANENT_PACKAGE.supportMonths);
  return {
    domain: LICENSE_ENTITLEMENT_DOMAIN,
    formatVersion: LICENSE_ENTITLEMENT_FORMAT,
    licenseId: options.licenseId ?? randomLicenseId(),
    workspaceId: request.workspaceId,
    installationId: request.installationId,
    deviceBinding: request.deviceBinding,
    productMajor: request.productMajor,
    type: "permanent" as const,
    issuedAt: issuedAt.toISOString(),
    expiresAt: null,
    supportEndsAt: supportEndsAt.toISOString(),
    shopSlots: PERMANENT_PACKAGE.includedShops + extraShops,
    memberLimit: PERMANENT_PACKAGE.memberLimit,
    deviceLimit: PERMANENT_PACKAGE.deviceLimit,
    backupBytes:
      PERMANENT_PACKAGE.baseBackupBytes + extraShops * PERMANENT_PACKAGE.backupBytesPerExtraShop,
    mediaBytes:
      PERMANENT_PACKAGE.baseMediaBytes + extraShops * PERMANENT_PACKAGE.mediaBytesPerExtraShop,
    features: [...PERMANENT_PACKAGE.features],
    transferState: "active" as const,
    transferEpoch: request.transferEpoch,
    recoveryEpoch: request.recoveryEpoch,
    revocationEpoch: request.revocationEpoch,
    keyId: options.keyId ?? DEFAULT_PERMANENT_KEY_ID,
    issuer: "founder-offline" as const,
  };
}
