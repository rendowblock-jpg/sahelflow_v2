import { buildPairingExchangeBody, deviceFingerprint, parsePairingLink, type GenerateDeviceKeysResult, type DeviceKeys, type PairingLink } from "../../../../src/lib/connected-platform/web";

export type PairStep = "signing" | "encryption" | "send";
export type PairFailure = "invalid_link" | "unsupported" | "keygen_failed" | "storage_failed" | "offline" | "expired" | "rejected" | "network";
export type ExchangeBody = ReturnType<typeof buildPairingExchangeBody>;
export type ExchangeResult =
  | Readonly<{ ok: true; deviceId: string; deviceToken: string; approval: "pending" | "approved" }>
  | Readonly<{ ok: false; reason: "expired" | "rejected" | "network" }>;
export interface PairingTransport { exchange(body: ExchangeBody): Promise<ExchangeResult> }
export interface KeygenRunner { run(onStep: (step: PairStep) => void): Promise<GenerateDeviceKeysResult> }
export interface PairStore {
  saveKeys(keys: DeviceKeys): Promise<void>;
  saveCredentials(credentials: Readonly<{ deviceId: string; deviceToken: string }>): Promise<void>;
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
  const link = parsePairingLink(hash);
  return link ? { kind: "link", link } : { kind: "invalid" };
}

export async function runPairing(deps: Readonly<{ link: PairingLink; online: boolean; keygen: KeygenRunner; transport: PairingTransport; store: PairStore; onStep: (step: PairStep) => void }>): Promise<PairOutcome> {
  if (!deps.online) return { ok: false, reason: "offline" };
  const made = await deps.keygen.run(deps.onStep).catch(() => null);
  if (!made) return { ok: false, reason: "keygen_failed" };
  if (!made.ok) return { ok: false, reason: made.reason === "keygen_failed" ? "keygen_failed" : "unsupported" };
  const fingerprint = await deviceFingerprint(made.publicKeys.signingPublicKey);
  if (!fingerprint) return { ok: false, reason: "keygen_failed" };
  try { await deps.store.saveKeys(made.keys); } catch { return { ok: false, reason: "storage_failed" }; }
  deps.onStep("send");
  let result: ExchangeResult;
  try { result = await deps.transport.exchange(buildPairingExchangeBody(deps.link.pairingId, deps.link.pairingToken, made.publicKeys)); } catch { return { ok: false, reason: "network", fingerprint }; }
  if (!result.ok) return { ok: false, reason: result.reason, fingerprint };
  try { await deps.store.saveCredentials({ deviceId: result.deviceId, deviceToken: result.deviceToken }); } catch { return { ok: false, reason: "storage_failed" }; }
  return { ok: true, fingerprint, approval: result.approval };
}
