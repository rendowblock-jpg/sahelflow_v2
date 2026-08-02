import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { signAsync } from "@noble/ed25519";

import {
  canonicalEntitlementBytes,
  entitlementClaimsSchema,
} from "../src/lib/license/entitlement";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [claimsArgument, privateKeyArgument] = process.argv.slice(2);
if (!claimsArgument || !privateKeyArgument) {
  fail("Usage: bun scripts/sign-license-entitlement.ts <claims.json> <private-key-file>");
}
const claimsPath = resolve(claimsArgument);
const privateKeyPath = isAbsolute(privateKeyArgument)
  ? privateKeyArgument
  : resolve(privateKeyArgument);
const repositoryRelative = relative(resolve(process.cwd()), privateKeyPath);
if (
  repositoryRelative === "" ||
  (!repositoryRelative.startsWith("..") && !isAbsolute(repositoryRelative))
) {
  fail("Permanent private key must remain outside the repository");
}

const claims = entitlementClaimsSchema.parse(JSON.parse(readFileSync(claimsPath, "utf8")));
if (claims.type !== "permanent" || claims.issuer !== "founder-offline") {
  fail("Offline signer accepts only permanent founder-offline claims");
}
const privateKeyText = readFileSync(privateKeyPath, "utf8").trim();
const privateKey = /^[0-9a-f]{64}$/i.test(privateKeyText)
  ? new Uint8Array(Buffer.from(privateKeyText, "hex"))
  : new Uint8Array(Buffer.from(privateKeyText, "base64"));
if (privateKey.length !== 32) fail("Permanent private key must be exactly 32 raw bytes");

const signature = await signAsync(canonicalEntitlementBytes(claims), privateKey);
privateKey.fill(0);
process.stdout.write(
  `${JSON.stringify({ claims, signature: Buffer.from(signature).toString("base64") }, null, 2)}\n`,
);
