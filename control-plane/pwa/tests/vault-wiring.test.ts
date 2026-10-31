// W3-F3 round 3d: the lock / hidden / wipe / unlock wiring of the decrypted-orders vault, on the REAL vault.
import { describe, expect, it, vi } from "vitest";
import { LOCK_AFTER_MS } from "../src/lock/state";
import { createVault } from "../src/storage/sealed";
import { createVaultWiring } from "../src/app/vault-wiring";

const KEY = "orders";
function rig() {
  const vault = createVault(); const wake = vi.fn();
  vault.put(KEY, { rows: [1, 2, 3] });
  return { vault, wake, w: createVaultWiring({ vault, key: KEY, wake }) };
}

describe("vault wiring", () => {
  it("hidden for 5 minutes or more drops the copies on return; one millisecond less keeps them", () => {
    const a = rig(); a.w.visibility({ hidden: true, phase: "unlocked", now: 1000 }); a.w.visibility({ hidden: false, phase: "unlocked", now: 1000 + LOCK_AFTER_MS - 1 });
    expect(a.vault.get(KEY)).not.toBeNull(); expect(a.wake).toHaveBeenLastCalledWith(false);
    const b = rig(); b.w.visibility({ hidden: true, phase: "unlocked", now: 1000 }); b.w.visibility({ hidden: false, phase: "unlocked", now: 1000 + LOCK_AFTER_MS });
    expect(b.vault.get(KEY)).toBeNull(); expect(b.wake).toHaveBeenLastCalledWith(true);
  });
  it("LOCK_AFTER_MS is five minutes", () => { expect(LOCK_AFTER_MS).toBe(5 * 60 * 1000); });
  it("a locked phase drops the copies at once, hidden or not, and does not wake the screen while hidden", () => {
    const a = rig(); a.w.visibility({ hidden: true, phase: "locked", now: 5 });
    expect(a.vault.get(KEY)).toBeNull(); expect(a.wake).not.toHaveBeenCalled();
    const b = rig(); b.w.visibility({ hidden: false, phase: "locked", now: 5 });
    expect(b.vault.get(KEY)).toBeNull();
  });
  it("lock() and wipe() drop the copies", () => {
    const a = rig(); a.w.locked(); expect(a.vault.get(KEY)).toBeNull();
    const b = rig(); b.w.wipe(); expect(b.vault.get(KEY)).toBeNull();
  });
  it("unlock wakes the screen: emptied when the vault is empty, not emptied when copies are still there", () => {
    const a = rig(); a.w.locked(); a.w.unlocked(); expect(a.wake).toHaveBeenCalledTimes(1); expect(a.wake).toHaveBeenLastCalledWith(true);
    a.vault.put(KEY, { rows: [] }); a.w.unlocked(); expect(a.wake).toHaveBeenLastCalledWith(false);
  });
  it("a hide that never returns keeps the first hidden time (a second hide does not reset the clock)", () => {
    const a = rig(); a.w.visibility({ hidden: true, phase: "unlocked", now: 0 }); a.w.visibility({ hidden: true, phase: "unlocked", now: LOCK_AFTER_MS - 10 });
    a.w.visibility({ hidden: false, phase: "unlocked", now: LOCK_AFTER_MS + 1 }); expect(a.vault.get(KEY)).toBeNull();
  });
});
