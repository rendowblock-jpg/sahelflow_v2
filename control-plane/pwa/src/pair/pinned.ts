// What the phone keeps once the desktop's key passed the pin check. The RSA key
// stored here is the canonical text the check approved, never the relay's string.
export type TrustedDesktop = Readonly<{ signingPublicKey: string; signingFingerprint: string; rsaPublicJwk: string }>;
// tokenCheckedAt: when the phone last asked the relay whether its token is due for a swap (sync/token-rotation.ts). Absent on phones paired before it existed.
export type PairingIdentity = Readonly<{ deviceId: string; deviceToken: string; workspaceId: string; memberId: string; shopId: string | null; tokenCheckedAt?: number }>;
