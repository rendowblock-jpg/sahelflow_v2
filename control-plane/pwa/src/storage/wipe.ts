import { DB_NAME, STORES, type Db } from "./idb";

export type WipeStep = "stores" | "database" | "caches" | "worker" | "local";
export type WipeResult = Readonly<{ ok: true; steps: WipeStep[] }> | Readonly<{ ok: false; steps: WipeStep[]; failed: WipeStep[] }>;
export type CacheLike = { keys(): Promise<string[]>; delete(name: string): Promise<boolean> };
export type StorageLike = Readonly<{ keys(): string[]; remove(key: string): void }>;
export type WipeDeps = Readonly<{ db: Db | null; factory: IDBFactory; caches: CacheLike | null; unregister: () => Promise<void>; storage: StorageLike; dbName?: string }>;

// "Remove this phone": every step is tried even when an earlier one fails, and
// the answer names what failed so the screen can say so.
export async function wipeAll(deps: WipeDeps): Promise<WipeResult> {
  const steps: WipeStep[] = []; const failed: WipeStep[] = [];
  const run = async (step: WipeStep, work: () => Promise<void> | void): Promise<void> => {
    try { await work(); steps.push(step); } catch { failed.push(step); }
  };
  await run("stores", async () => { if (deps.db) for (const s of STORES) await deps.db.clear(s); });
  await run("database", () => new Promise<void>((resolve, reject) => {
    deps.db?.close();
    const request = deps.factory.deleteDatabase(deps.dbName ?? DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("idb_delete_failed"));
  }));
  await run("caches", async () => {
    if (!deps.caches) return;
    for (const name of (await deps.caches.keys()).filter((n) => n.startsWith("sfapp-v"))) await deps.caches.delete(name);
  });
  await run("worker", () => deps.unregister());
  await run("local", () => { for (const key of deps.storage.keys().filter((k) => k.startsWith("sf."))) deps.storage.remove(key); });
  return failed.length === 0 ? { ok: true, steps } : { ok: false, steps, failed };
}
