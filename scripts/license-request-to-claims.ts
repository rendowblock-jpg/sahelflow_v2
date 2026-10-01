#!/usr/bin/env bun
/**
 * Turn a customer's licence request code (Settings → Licence, or the licence
 * screen) into permanent-licence claims ready for the offline signer:
 *
 *   bun scripts/license-request-to-claims.ts <SFLR1.…> [options] > claims.json
 *   bun scripts/sign-license-entitlement.ts claims.json <permanent-private-key-file>
 *
 * Options: --key-id permanent-2026-10  --support-months 12  --shops 1
 *          --members 5  --devices 1
 *
 * The code only names the installation; the licence is valid only once the
 * Founder's offline key signs these claims, and activation re-checks them.
 */
import { randomBytes } from "node:crypto";

import { entitlementClaimsSchema, LICENSE_ENTITLEMENT_DOMAIN, LICENSE_ENTITLEMENT_FORMAT } from "../src/lib/license/entitlement";
import { decodeLicenseRequest } from "../src/lib/license/request-code";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [code, ...rest] = process.argv.slice(2);
if (!code) fail("Usage: bun scripts/license-request-to-claims.ts <SFLR1.code> [--key-id id] [--support-months n] [--shops n] [--members n] [--devices n]");

const options = new Map<string, string>();
for (let index = 0; index < rest.length; index += 2) {
  const name = rest[index];
  const value = rest[index + 1];
  if (!name?.startsWith("--") || value === undefined) fail(`Invalid option near ${name ?? "end"}`);
  options.set(name.slice(2), value);
}
function integer(name: string, fallback: number): number {
  const raw = options.get(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) fail(`--${name} must be a positive integer`);
  return value;
}

let request;
try {
  request = decodeLicenseRequest(code);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const issuedAt = new Date();
const supportEndsAt = new Date(issuedAt);
supportEndsAt.setUTCMonth(supportEndsAt.getUTCMonth() + integer("support-months", 12));

const claims = entitlementClaimsSchema.parse({
  domain: LICENSE_ENTITLEMENT_DOMAIN,
  formatVersion: LICENSE_ENTITLEMENT_FORMAT,
  licenseId: `perm-${randomBytes(12).toString("hex")}`,
  workspaceId: request.workspaceId,
  installationId: request.installationId,
  deviceBinding: request.deviceBinding,
  productMajor: request.productMajor,
  type: "permanent",
  issuedAt: issuedAt.toISOString(),
  expiresAt: null,
  supportEndsAt: supportEndsAt.toISOString(),
  shopSlots: integer("shops", 1),
  memberLimit: integer("members", 5),
  deviceLimit: integer("devices", 1),
  backupBytes: 20_000_000_000,
  mediaBytes: 0,
  features: ["sahelflow.complete"],
  transferState: "active",
  transferEpoch: request.transferEpoch,
  recoveryEpoch: request.recoveryEpoch,
  revocationEpoch: request.revocationEpoch,
  keyId: options.get("key-id") ?? "permanent-2026-10",
  issuer: "founder-offline",
});

process.stdout.write(`${JSON.stringify(claims, null, 2)}\n`);
