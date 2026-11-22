// Proof of possession of the desktop Ed25519 signing key during POST /v1/bootstrap.
// Shared between the desktop runtime (signing) and the relay worker (verification).
// Pure WebCrypto + TextEncoder only — zero Node-only imports so Cloudflare Workers bundle it cleanly.

import { base64Encode } from "./web/bytes";

export const BOOTSTRAP_PROOF_CONTEXT = "sahelflow-bootstrap-proof-v1";
export const BOOTSTRAP_PROOF_WINDOW_MS = 5 * 60 * 1000;

export type DesktopBootstrapProof = Readonly<{
  issuedAt: number;
  signature: string;
}>;

export type BootstrapProofInput = Readonly<{
  workspaceId: string;
  installationId: string;
  deviceBinding: string;
  desktopSigningPublicKey: string;
  desktopEncryptionPublicKey: string;
  issuedAt: number;
}>;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Canonical domain-separated bytes signed by the desktop Ed25519 key at bootstrap. */
export function canonicalBootstrapProofBytes(input: BootstrapProofInput): Uint8Array {
  const payload = [
    BOOTSTRAP_PROOF_CONTEXT,
    input.workspaceId,
    input.installationId,
    input.deviceBinding,
    input.desktopSigningPublicKey,
    input.desktopEncryptionPublicKey,
    String(input.issuedAt),
  ].join("\n");
  return new TextEncoder().encode(payload);
}

/** Validates shape + freshness window before running Ed25519 verification on the relay. */
export function parseBootstrapProof(
  value: unknown,
  nowMs = Date.now(),
): { ok: true; proof: DesktopBootstrapProof } | { ok: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  const row = value as { issuedAt?: unknown; signature?: unknown };
  if (
    typeof row.issuedAt !== "number" ||
    !Number.isSafeInteger(row.issuedAt) ||
    Math.abs(nowMs - row.issuedAt) > BOOTSTRAP_PROOF_WINDOW_MS
  ) {
    return { ok: false };
  }
  if (
    typeof row.signature !== "string" ||
    row.signature.length < 64 ||
    row.signature.length > 128 ||
    !BASE64.test(row.signature)
  ) {
    return { ok: false };
  }
  return { ok: true, proof: { issuedAt: row.issuedAt, signature: row.signature } };
}

/** Signs the bootstrap proof on the desktop using its Ed25519 private CryptoKey. */
export async function signBootstrapProof(
  input: BootstrapProofInput,
  signingPrivateKey: CryptoKey,
): Promise<DesktopBootstrapProof> {
  const bytes = canonicalBootstrapProofBytes(input);
  const raw = await crypto.subtle.sign(
    { name: "Ed25519" },
    signingPrivateKey,
    bytes as BufferSource,
  );
  return {
    issuedAt: input.issuedAt,
    signature: base64Encode(new Uint8Array(raw)),
  };
}
