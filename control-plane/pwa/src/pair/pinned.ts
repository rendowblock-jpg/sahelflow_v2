/**
 * TODO(S1/S2, pairing trust gap): the desktop's signing key and its signed RSA
 * key must reach the phone through the QR fragment (#p=<id>.<token>.<fp>) and be
 * pinned here, so a hostile relay cannot swap them. Nothing implements this yet;
 * the Pair screen only carries the seam.
 */
export interface PinnedDesktopKey {
  readonly signingFingerprint: string;
  verifyRsaKeyBinding(input: Readonly<{ rsaPublicKey: string; signature: string }>): Promise<"ok" | "signature_invalid" | "key_not_pinned">;
}
