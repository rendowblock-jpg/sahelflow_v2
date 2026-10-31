import type { DeviceKeys } from "../../../../src/lib/connected-platform/web";

export const DB_NAME = "sfapp";
// v2 (W3-F3): `sealed` = projection envelopes as received, `outbox` = commands waiting for the PC.
export const DB_VERSION = 2;
export const STORES = ["keys", "settings", "projections", "sealed", "outbox"] as const;
export type StoreName = (typeof STORES)[number];
export type Db = Readonly<{
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  remove(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
  close(): void;
}>;

const ask = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("idb_error")); });
const finish = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_error"));
    tx.onabort = () => reject(tx.error ?? new Error("idb_aborted"));
  });

export function openDb(factory: IDBFactory, name: string = DB_NAME): Promise<Db> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const store of STORES) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onerror = () => reject(request.error ?? new Error("idb_open_failed"));
    request.onsuccess = () => {
      const db = request.result;
      const write = async (store: StoreName, run: (s: IDBObjectStore) => void): Promise<void> => {
        const tx = db.transaction(store, "readwrite"); const done = finish(tx);
        run(tx.objectStore(store)); await done;
      };
      resolve({
        get: async <T>(store: StoreName, key: string) => (await ask(db.transaction(store, "readonly").objectStore(store).get(key))) as T | undefined,
        put: (store, key, value) => write(store, (s) => { s.put(value, key); }),
        remove: (store, key) => write(store, (s) => { s.delete(key); }),
        clear: (store) => write(store, (s) => { s.clear(); }),
        keys: async (store) => (await ask(db.transaction(store, "readonly").objectStore(store).getAllKeys())).map(String),
        close: () => db.close(),
      });
    };
  });
}

// Private keys go in as the CryptoKey objects themselves (structured clone). A
// key that script could read out is refused, and nothing here ever exports one.
export async function saveDeviceKeys(db: Db, keys: DeviceKeys): Promise<void> {
  if (keys.signing.privateKey.extractable || keys.encryption.privateKey.extractable) throw new Error("extractable_private_key");
  await db.put("keys", "device", { signing: keys.signing, encryption: keys.encryption });
}
export async function loadDeviceKeys(db: Db): Promise<DeviceKeys | null> {
  return (await db.get<DeviceKeys>("keys", "device")) ?? null;
}
