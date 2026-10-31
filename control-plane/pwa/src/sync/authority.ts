// What the phone may seal a command with, read from the LAST VERIFIED dashboard projection (sealed by the PC, opened with the
// pinned key): the policy version, the member's revocation epoch (connectedCommandAuthority) and the PC's installation id (the
// envelope's own). The relay compares the epoch with its policy row and the recipient with the workspace: a guess would be refused.
import type { Db } from "../storage/idb";
import type { PhoneScope } from "./transport";

export type CommandAuthority = Readonly<{ policyVersion: number; installationId: string; revocationEpoch: number }>;
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** null unless all three are present and well formed: a command is never sealed with a made-up scope. */
export function authorityOf(snapshot: unknown): CommandAuthority | null {
  const a = obj(obj(obj(snapshot)?.projection)?.authority);
  const policyVersion = a?.policyVersion; const epoch = a?.memberRevocationEpoch; const installationId = a?.installationId;
  if (typeof policyVersion !== "number" || !Number.isSafeInteger(policyVersion) || policyVersion < 1) return null;
  if (typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch < 0) return null;
  if (typeof installationId !== "string" || installationId.length < 8) return null;
  return { policyVersion, installationId, revocationEpoch: epoch };
}
/** When the PC's command authority ends (epoch ms, from the verified projection's authority.expiresAt); null when absent or not a real time. */
export function authorityExpiryOf(snapshot: unknown): number | null {
  const at = obj(obj(obj(snapshot)?.projection)?.authority)?.expiresAt;
  return typeof at === "number" && Number.isFinite(at) && at > 0 ? at : null;
}
export function createAuthority(db: Db) {
  let current: CommandAuthority | null = null; let expiry: number | null = null;
  return {
    /** Call after every projection poll that updated the snapshot. */
    async load(): Promise<void> { const snap = await db.get("projections", "last"); current = authorityOf(snap); expiry = current ? authorityExpiryOf(snap) : null; },
    /** The PC time the command authority ends, or undefined when unknown (the chip then shows nothing). */
    expiresAt: (): number | undefined => expiry ?? undefined,
    policyVersion: (): number | null => current?.policyVersion ?? null,
    scope: (): PhoneScope | null => (current ? { installationId: current.installationId, revocationEpoch: current.revocationEpoch } : null),
  };
}
