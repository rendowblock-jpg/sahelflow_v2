#!/usr/bin/env bun
/**
 * Generate an Ed25519 signing key pair for SahelFlow licensing.
 *
 *   bun scripts/licensing-keygen.ts trial trial-2026-10 <out-dir-outside-repo>
 *   bun scripts/licensing-keygen.ts permanent permanent-2026-10 <out-dir-outside-repo>
 *
 * Writes the PRIVATE key only to a file outside the repository (never stdout)
 * and prints the PUBLIC keyring entry to merge into the matching GitHub
 * variable (SF_LICENSE_TRIAL_PUBLIC_KEYS / SF_LICENSE_PERMANENT_PUBLIC_KEYS)
 * and, for trials, into the licensing Worker's SF_LICENSE_TRIAL_PUBLIC_KEYS.
 *
 * Trial private key → `wrangler secret put TRIAL_PRIVATE_KEY_PKCS8` (PKCS#8, base64).
 * Permanent private key → kept offline for scripts/sign-license-entitlement.ts (raw 32 bytes, base64).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [kind, keyId, outDirArgument] = process.argv.slice(2);
if ((kind !== "trial" && kind !== "permanent") || !keyId || !outDirArgument) {
  fail("Usage: bun scripts/licensing-keygen.ts <trial|permanent> <key-id> <out-dir-outside-repo>");
}
if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(keyId)) fail("Key id must be lowercase letters, digits and dashes");

const outDir = resolve(outDirArgument);
const fromRepo = relative(resolve(process.cwd()), outDir);
if (fromRepo === "" || (!fromRepo.startsWith("..") && !isAbsolute(fromRepo))) {
  fail("The private key directory must be outside the repository");
}

const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
const publicRaw = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64");
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey));

mkdirSync(outDir, { recursive: true, mode: 0o700 });
const privatePath = join(outDir, `${keyId}.private`);
// Ed25519 PKCS#8 is a fixed 16-byte prefix followed by the 32-byte seed.
const material = kind === "trial" ? pkcs8.toString("base64") : pkcs8.subarray(pkcs8.length - 32).toString("base64");
writeFileSync(privatePath, `${material}\n`, { mode: 0o600, flag: "wx" });

process.stdout.write(
  [
    `Private key written to ${privatePath} (keep it offline; never commit or paste it).`,
    `Public keyring entry for ${kind === "trial" ? "SF_LICENSE_TRIAL_PUBLIC_KEYS" : "SF_LICENSE_PERMANENT_PUBLIC_KEYS"}:`,
    JSON.stringify({ [keyId]: publicRaw }),
    "",
  ].join("\n"),
);
