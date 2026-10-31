// What the phone keeps once the desktop's key passed the pin check. The RSA key
// stored here is the canonical text the check approved, never the relay's string.
export type TrustedDesktop = Readonly<{ signingPublicKey: string; signingFingerprint: string; rsaPublicJwk: string }>;
export type PairingIdentity = Readonly<{ deviceId: string; deviceToken: string; workspaceId: string; memberId: string; shopId: string | null }>;
