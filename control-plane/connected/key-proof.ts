// The optional `desktopKeyProof` of POST /v1/desktop/pairings: the desktop's
// Ed25519 signature over its RSA key, carried to the phone by the relay. The
// relay checks the FORMAT only (it cannot judge the signature: the phone does,
// against the key pinned in the link). Shape: "<base64 signature>.<context>";
// the signature never holds a ".", so the first "." splits the two.
export const MAX_KEY_PROOF_CHARS = 512;

const KEY_PROOF = /^[A-Za-z0-9+/_-]{16,500}={0,2}\.[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export type KeyProofField = { ok: true; proof: string | null } | { ok: false };

export function parseDesktopKeyProofField(value: unknown): KeyProofField {
  // An old desktop sends nothing: that keeps working and is stored as NULL.
  if (value === undefined || value === null) return { ok: true, proof: null };
  if (typeof value !== "string" || value.length > MAX_KEY_PROOF_CHARS || !KEY_PROOF.test(value)) {
    return { ok: false };
  }
  return { ok: true, proof: value };
}
