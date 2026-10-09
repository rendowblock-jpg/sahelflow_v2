/**
 * SahelFlow License Desk — pure logic.
 *
 * Runs inside a single offline HTML page on the Founder's own computer. The
 * permanent private key is read from a local file into memory, used to sign,
 * and never written, uploaded or stored by the page. Everything here is
 * browser-safe (WebCrypto + the bundled pure-JS Ed25519) and is exercised by
 * tests against the app's real activation validator.
 */
import { getPublicKeyAsync, signAsync, verifyAsync } from "@noble/ed25519";

import { encodeActivationCode } from "../../src/lib/license/activation-code";
import { canonicalEntitlementBytes } from "../../src/lib/license/entitlement-canonical";
import {
  MAXIMUM_EXTRA_SHOPS,
  PERMANENT_PACKAGE,
  packageTotalDzd,
  permanentLicenseClaims,
  type PermanentLicenseRequestFacts,
} from "../../src/lib/license/packages";

export { MAXIMUM_EXTRA_SHOPS, PERMANENT_PACKAGE, packageTotalDzd };

const REQUEST_PREFIX = "SFLR1";

export interface DecodedRequest extends PermanentLicenseRequestFacts {
  currentLicenseId: string | null;
}

export class DeskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeskError";
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64UrlToText(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    base64ToBytes(padded + "=".repeat((4 - (padded.length % 4)) % 4)),
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

const HEX32 = /^[0-9a-f]{32}$/i;
const BINDING = /^sfdb1_[0-9a-f]{64}$/;
const LICENSE_ID = /^[a-z0-9][a-z0-9_-]{7,127}$/;

function epoch(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new DeskError(`The request code has an invalid ${name}.`);
  }
  return value;
}

/**
 * Decode a seller's licence request code exactly as src/lib/license/
 * request-code.ts does on the server (same prefix, SHA-256 checksum and
 * field rules), using WebCrypto so it runs in the browser.
 */
export async function decodeRequestCode(code: string): Promise<DecodedRequest> {
  const parts = code.replace(/\s+/g, "").split(".");
  if (parts.length !== 3 || parts[0] !== REQUEST_PREFIX) {
    throw new DeskError("This is not a SahelFlow request code. It starts with SFLR1.");
  }
  const [, payload, sum] = parts as [string, string, string];
  const expected = (await sha256Hex(`${REQUEST_PREFIX}:${payload}`)).slice(0, 8);
  if (expected !== sum.toLowerCase()) {
    throw new DeskError("The request code is incomplete or mistyped. Ask the seller to copy it again.");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(base64UrlToText(payload)) as Record<string, unknown>;
  } catch {
    throw new DeskError("The request code could not be read.");
  }
  const keys = Object.keys(parsed).sort().join(",");
  if (
    keys !==
    "currentLicenseId,deviceBinding,installationId,productMajor,recoveryEpoch,revocationEpoch,transferEpoch,workspaceId"
  ) {
    throw new DeskError("The request code has unexpected fields.");
  }
  if (typeof parsed.workspaceId !== "string" || !HEX32.test(parsed.workspaceId)) {
    throw new DeskError("The request code has an invalid workspace.");
  }
  if (typeof parsed.installationId !== "string" || !HEX32.test(parsed.installationId)) {
    throw new DeskError("The request code has an invalid installation.");
  }
  if (typeof parsed.deviceBinding !== "string" || !BINDING.test(parsed.deviceBinding)) {
    throw new DeskError("The request code has an invalid device binding.");
  }
  const productMajor = parsed.productMajor;
  if (typeof productMajor !== "number" || !Number.isInteger(productMajor) || productMajor < 1 || productMajor > 1000) {
    throw new DeskError("The request code has an invalid product version.");
  }
  const currentLicenseId = parsed.currentLicenseId;
  if (currentLicenseId !== null && (typeof currentLicenseId !== "string" || !LICENSE_ID.test(currentLicenseId))) {
    throw new DeskError("The request code has an invalid current licence.");
  }
  return {
    workspaceId: parsed.workspaceId,
    installationId: parsed.installationId,
    deviceBinding: parsed.deviceBinding,
    productMajor,
    transferEpoch: epoch(parsed.transferEpoch, "transfer epoch"),
    revocationEpoch: epoch(parsed.revocationEpoch, "revocation epoch"),
    recoveryEpoch: epoch(parsed.recoveryEpoch, "recovery epoch"),
    currentLicenseId: currentLicenseId as string | null,
  };
}

/** The key file written by licensing-keygen.ts or by this Desk: 32 raw bytes. */
export function parsePrivateKey(text: string): Uint8Array {
  const value = text.trim();
  const bytes = /^[0-9a-f]{64}$/i.test(value)
    ? Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
    : (() => {
        try {
          return base64ToBytes(value);
        } catch {
          return new Uint8Array();
        }
      })();
  if (bytes.length !== 32) {
    throw new DeskError("This is not a SahelFlow permanent signing key file.");
  }
  return bytes;
}

export function keyIdFromFileName(name: string): string | null {
  const match = /^([a-z0-9][a-z0-9-]{2,62})\.private$/i.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function isValidKeyId(keyId: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,62}$/.test(keyId) && /^[a-z0-9][a-z0-9_-]{7,127}$/.test(keyId);
}

export async function publicKeyBase64(privateKey: Uint8Array): Promise<string> {
  return bytesToBase64(await getPublicKeyAsync(privateKey));
}

export async function generateSigningKey(): Promise<{ privateKeyText: string; publicKey: string }> {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = await publicKeyBase64(seed);
  const privateKeyText = `${bytesToBase64(seed)}\n`;
  seed.fill(0);
  return { privateKeyText, publicKey };
}

/**
 * Compare the loaded key with the public keyring the app was built with
 * (the SF_LICENSE_PERMANENT_PUBLIC_KEYS variable). A licence only activates
 * when its key id is in that keyring with this exact public key.
 */
export function keyringVerdict(
  keyringText: string,
  keyId: string,
  publicKey: string,
): "match" | "missing" | "different" | "unreadable" {
  let parsed: unknown;
  try {
    parsed = JSON.parse(keyringText.trim().replace(/\}\s*,?\s*\{/g, ","));
  } catch {
    return "unreadable";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "unreadable";
  const entry = (parsed as Record<string, unknown>)[keyId];
  if (entry === undefined) return "missing";
  return entry === publicKey ? "match" : "different";
}

export interface SignedLicense {
  claims: ReturnType<typeof permanentLicenseClaims>;
  signature: string;
  activationCode: string;
}

export async function signLicense(input: {
  request: DecodedRequest;
  extraShops: number;
  keyId: string;
  privateKey: Uint8Array;
  issuedAt?: Date;
}): Promise<SignedLicense> {
  if (!isValidKeyId(input.keyId)) throw new DeskError("The key id is not valid.");
  const claims = permanentLicenseClaims(input.request, {
    extraShops: input.extraShops,
    keyId: input.keyId,
    issuedAt: input.issuedAt,
  });
  const message = canonicalEntitlementBytes(claims);
  const signatureBytes = await signAsync(message, input.privateKey);
  // Self-check before anything leaves the Desk.
  const publicKey = await getPublicKeyAsync(input.privateKey);
  if (!(await verifyAsync(signatureBytes, message, publicKey))) {
    throw new DeskError("The signature could not be verified. Nothing was issued.");
  }
  const signature = bytesToBase64(signatureBytes);
  return { claims, signature, activationCode: encodeActivationCode({ claims, signature }) };
}

export interface SaleRecord {
  issuedAt: string;
  licenseId: string;
  installation: string;
  customer: string;
  phone: string;
  paymentReference: string;
  extraShops: number;
  totalDzd: number;
  supportEndsAt: string;
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Neutralise spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function salesCsv(records: readonly SaleRecord[]): string {
  const header = [
    "Issued at",
    "Licence number",
    "Installation",
    "Customer",
    "Phone",
    "Payment reference",
    "Extra shops",
    "Total (DZD)",
    "Updates until",
  ];
  const rows = records.map((record) =>
    [
      record.issuedAt,
      record.licenseId,
      record.installation,
      record.customer,
      record.phone,
      record.paymentReference,
      record.extraShops,
      record.totalDzd,
      record.supportEndsAt,
    ]
      .map(csvCell)
      .join(","),
  );
  return `﻿${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

export type MessageLocale = "ar" | "fr" | "en";

/** The reply the Founder pastes into WhatsApp, in the seller's language. */
export function sellerMessage(locale: MessageLocale, activationCode: string, shops: number): string {
  if (locale === "ar") {
    return [
      "شكراً لشرائك SahelFlow! 🎉",
      `ترخيصك الدائم جاهز (${shops} متاجر، تحديثات لمدة 5 سنوات).`,
      "افتح SahelFlow ← «تفعيل ترخيصي» ثم الصق الرمز التالي كاملاً:",
      "",
      activationCode,
    ].join("\n");
  }
  if (locale === "fr") {
    return [
      "Merci pour votre achat de SahelFlow ! 🎉",
      `Votre licence permanente est prête (${shops} boutiques, 5 ans de mises à jour).`,
      "Ouvrez SahelFlow → « Activer ma licence » puis collez le code ci-dessous en entier :",
      "",
      activationCode,
    ].join("\n");
  }
  return [
    "Thank you for buying SahelFlow! 🎉",
    `Your permanent licence is ready (${shops} shops, 5 years of updates).`,
    "Open SahelFlow → “Activate my licence” and paste the whole code below:",
    "",
    activationCode,
  ].join("\n");
}
