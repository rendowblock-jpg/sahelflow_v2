import type { LockState } from "../lock/state";

// What the app does with the in-memory vault (decrypted orders) when the phone locks, hides, unlocks or is wiped.
// Kept out of app.ts so it has its own tests. The vault drops its copies by itself when it was hidden for LOCK_AFTER_MS or more.
export type VaultPort = Readonly<{ hide(now: number): void; show(now: number): void; lock(): void; get<T>(key: string): T | null }>;
export type VaultWiringDeps = Readonly<{
  vault: VaultPort;
  key: string;
  /** After the vault changed: the screen redraws; `emptied` says the copies are gone and must be fetched again. */
  wake(emptied: boolean): void;
}>;

export function createVaultWiring(deps: VaultWiringDeps) {
  const wake = (): void => deps.wake(deps.vault.get(deps.key) === null);
  return {
    /** The page went hidden or visible; `phase` is the lock phase AFTER the lock state took the same event. */
    visibility(i: Readonly<{ hidden: boolean; phase: LockState["phase"]; now: number }>): void {
      if (i.hidden) deps.vault.hide(i.now); else deps.vault.show(i.now);
      if (i.phase === "locked") deps.vault.lock();
      if (!i.hidden) wake();
    },
    /** The PIN lock engaged on its own (not through a visibility change). */
    locked(): void { deps.vault.lock(); },
    /** Right PIN: the screen redraws from what is left and reloads if the vault is empty. */
    unlocked(): void { wake(); },
    /** Revoked or removed: nothing decrypted stays in memory. */
    wipe(): void { deps.vault.lock(); },
  };
}
