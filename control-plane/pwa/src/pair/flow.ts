import { buildPairingExchangeBody, deviceFingerprint, type GenerateDeviceKeysResult, type DeviceKeys } from "../../../../src/lib/connected-platform/web";
import { parseDesktopPairingHash, type DesktopPairingFragment } from "../../../../src/lib/connected-platform/pairing-link";
import { verifyDesktopKeyProof, type VerifyDesktopKeyProofReason, type VerifyDesktopKeyProofResult } from "../../../../src/lib/connected-platform/pairing-trust";
import type { PairingIdentity, TrustedDesktop } from "./pinned";

// Why the desktop's key was refused (the typed reasons of the shared verifier).
export type TrustRefusal = VerifyDesktopKeyProofReason;
export const TRUST_REFUSALS: readonly TrustRefusal[] = ["proof_missing", "bad_signature", "key_mismatch_with_pin", "wrong_context", "malformed", "unavailable"];
export type PairStep = "signing" | "encryption" | "send";
export type PairFailure = "invalid_link" | "unsupported" | "keygen_failed" | "storage_failed" | "offline" | "expired" | "rejected" | "network" | TrustRefusal;
export type PairingLink = DesktopPairingFragment;
export type ExchangeBody = ReturnType<typeof buildPairingExchangeBody>;
export type ExchangeResult =
  | (Readonly<{ ok: true; approval: "pending" | "approved"; desktopSigningPublicKey: string; desktopEncryptionPublicKey: string; desktopKeyProof: string | null }> & PairingIdentity)
  | Readonly<{ ok: false; reason: "expired" | "rejected" | "network" }>;
export interface PairingTransport { exchange(body: ExchangeBody): Promise<ExchangeResult> }
export interface KeygenRunner { run(onStep: (step: PairStep) => void): Promise<GenerateDeviceKeysResult> }
export interface PairStore {
  saveKeys(keys: DeviceKeys): Promise<void>;
  saveTrust(trusted: TrustedDesktop): Promise<void>;
  saveCredentials(identity: PairingIdentity): Promise<void>;
  // Throw away everything this phone holds (a refusal, or a failed save).
  discard(): Promise<void>;
}
export type PairOutcome =
  | Readonly<{ ok: true; fingerprint: string; approval: "pending" | "approved" }>
  | Readonly<{ ok: false; reason: PairFailure; fingerprint?: string }>;
export type TakenLink = Readonly<{ kind: "none" }> | Readonly<{ kind: "invalid" }> | Readonly<{ kind: "link"; link: PairingLink }>;

// The fragment holds a one-time secret: read it once, then take it out of the
// address bar and the history entry before doing anything else.
export function takePairingLink(hash: string, pathAndSearch: string, replaceUrl: (url: string) => void): TakenLink {
  if (!hash.startsWith("#p=")) return { kind: "none" };
  replaceUrl(pathAndSearch);
  const link = parseDesktopPairingHash(hash);
  return link ? { kind: "link", link } : { kind: "invalid" };
}

export async function runPairing(deps: Readonly<{ link: PairingLink; online: boolean; keygen: KeygenRunner; transport: PairingTransport; store: PairStore; onStep: (step: PairStep) => void }>): Promise<PairOutcome> {
  if (!deps.online) return { ok: false, reason: "offline" };
  const made = await deps.keygen.run(deps.onStep).catch(() => null);
  if (!made) return { ok: false, reason: "keygen_failed" };
  if (!made.ok) return { ok: false, reason: made.reason === "keygen_failed" ? "keygen_failed" : "unsupported" };
  const fingerprint = await deviceFingerprint(made.publicKeys.signingPublicKey);
  if (!fingerprint) return { ok: false, reason: "keygen_failed" };
  deps.onStep("send");
  let result: ExchangeResult;
  try { result = await deps.transport.exchange(buildPairingExchangeBody(deps.link.pairingId, deps.link.pairingToken, made.publicKeys)); } catch { return { ok: false, reason: "network", fingerprint }; }
  if (!result.ok) return { ok: false, reason: result.reason, fingerprint };
  const discard = async (): Promise<void> => { await deps.store.discard().catch(() => undefined); };
  // Trust first: nothing is stored, sealed or signed until the desktop's key
  // proved itself against the pin from the link fragment (never from the relay).
  const verdict = await verifyDesktopKeyProof({
    rsaPublicJwk: result.desktopEncryptionPublicKey, desktopKeyProof: result.desktopKeyProof,
    desktopSigningPublicKey: result.desktopSigningPublicKey, pinnedFingerprint: deps.link.pin,
  }).catch((): VerifyDesktopKeyProofResult => ({ ok: false, reason: "unavailable" }));
  if (!verdict.ok) { await discard(); return { ok: false, reason: verdict.reason, fingerprint }; }
  try {
    await deps.store.saveKeys(made.keys);
    await deps.store.saveTrust({ signingPublicKey: result.desktopSigningPublicKey, signingFingerprint: verdict.signingFingerprint, rsaPublicJwk: verdict.rsaPublicJwk });
    // The device token goes in last: a half-saved phone never holds a credential.
    await deps.store.saveCredentials({ deviceId: result.deviceId, deviceToken: result.deviceToken, workspaceId: result.workspaceId, memberId: result.memberId, shopId: result.shopId });
  } catch { await discard(); return { ok: false, reason: "storage_failed", fingerprint }; }
  return { ok: true, fingerprint, approval: result.approval };
}
