#!/usr/bin/env bun
/**
 * Turn a customer's licence request code (Settings → Licence, or the licence
 * screen) into permanent-licence claims ready for the offline signer:
 *
 *   bun scripts/license-request-to-claims.ts <SFLR1.…> [--extra-shops n] [--key-id id] > claims.json
 *   bun scripts/sign-license-entitlement.ts claims.json <permanent-private-key-file>
 *
 * The claims are the SahelFlow 1.0 package (src/lib/license/packages.ts):
 * five shops plus any paid extras, owner + ten members, 23 remote devices,
 * backup/media allowances and five years of updates. Nothing is typed by
 * hand, so a paying seller cannot be under-entitled by a default.
 *
 * The code only names the installation; the licence is valid only once the
 * Founder's offline key signs these claims, and activation re-checks them.
 * The License Desk (tools/license-desk) does the same in a browser.
 */
import { entitlementClaimsSchema } from "../src/lib/license/entitlement";
import {
  DEFAULT_PERMANENT_KEY_ID,
  MAXIMUM_EXTRA_SHOPS,
  permanentLicenseClaims,
} from "../src/lib/license/packages";
import { decodeLicenseRequest } from "../src/lib/license/request-code";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [code, ...rest] = process.argv.slice(2);
if (!code) {
  fail("Usage: bun scripts/license-request-to-claims.ts <SFLR1.code> [--extra-shops n] [--key-id id]");
}

const options = new Map<string, string>();
for (let index = 0; index < rest.length; index += 2) {
  const name = rest[index];
  const value = rest[index + 1];
  if (!name?.startsWith("--") || value === undefined) fail(`Invalid option near ${name ?? "end"}`);
  options.set(name.slice(2), value);
}
for (const name of options.keys()) {
  if (name !== "extra-shops" && name !== "key-id") fail(`Unknown option --${name}`);
}

const extraShops = Number.parseInt(options.get("extra-shops") ?? "0", 10);
if (!Number.isSafeInteger(extraShops) || extraShops < 0 || extraShops > MAXIMUM_EXTRA_SHOPS) {
  fail(`--extra-shops must be an integer from 0 to ${MAXIMUM_EXTRA_SHOPS}`);
}

let request;
try {
  request = decodeLicenseRequest(code);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const claims = entitlementClaimsSchema.parse(
  permanentLicenseClaims(request, {
    extraShops,
    keyId: options.get("key-id") ?? DEFAULT_PERMANENT_KEY_ID,
  }),
);

process.stdout.write(`${JSON.stringify(claims, null, 2)}\n`);
