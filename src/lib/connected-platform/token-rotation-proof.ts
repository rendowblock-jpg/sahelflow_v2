// What a phone signs to prove it still holds the signing key it was paired with, when it asks the relay for a new device token
// (W4SEC-05). ONE function builds the bytes for both sides - the phone signs them, the relay Worker verifies them - so the two
// can not drift. Browser-safe: TextEncoder only, no node: import.
//
// The message binds the proof to this workspace, this device, this exact token (by its SHA-256, so the secret itself is never
// signed) and the phone's clock. A proof made for one token or one device is worthless for another.
export const TOKEN_ROTATION_PROOF_DOMAIN = "sahelflow.device-token-rotate.v1";

export type TokenRotationProofInput = Readonly<{
  workspaceId: string;
  deviceId: string;
  /** Lower-case hex SHA-256 of the bearer token being replaced. */
  tokenSha256Hex: string;
  /** The phone's clock, milliseconds since the epoch. The relay accepts a few minutes either way. */
  issuedAt: number;
}>;

export function tokenRotationProofBytes(input: TokenRotationProofInput): Uint8Array {
  const parts = [TOKEN_ROTATION_PROOF_DOMAIN, input.workspaceId, input.deviceId, input.tokenSha256Hex, String(input.issuedAt)];
  // A field with a line break could be shifted into its neighbour; the relay only accepts plain ids, this refuses the rest.
  if (parts.some((part) => part.includes("\n")) || !Number.isSafeInteger(input.issuedAt)) throw new Error("invalid token rotation proof input");
  return new TextEncoder().encode(parts.join("\n"));
}
