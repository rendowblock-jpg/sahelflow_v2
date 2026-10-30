// A small in-memory IndexedDB: enough for the storage wrapper. Values are kept by
// reference, which is what structured clone does for a CryptoKey (the key object
// goes in and comes out; its bytes are never visible to script).
type Handler = ((ev: unknown) => void) | null;
export class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
}
const later = (fn: () => void): void => { queueMicrotask(fn); };
class FakeStore {
  constructor(private readonly data: Map<string, unknown>, private readonly tx: FakeTx) {}
  private req<T>(compute: () => T): FakeRequest<T> {
    const r = new FakeRequest<T>(); this.tx.pending += 1;
    later(() => { r.result = compute(); r.onsuccess?.({ target: r }); this.tx.pending -= 1; });
    return r;
  }
  get(key: string) { return this.req(() => this.data.get(key)); }
  put(value: unknown, key: string) { return this.req(() => { this.data.set(key, value); return key; }); }
  delete(key: string) { return this.req(() => { this.data.delete(key); return undefined; }); }
  clear() { return this.req(() => { this.data.clear(); return undefined; }); }
  getAllKeys() { return this.req(() => [...this.data.keys()]); }
}
class FakeTx {
  pending = 0;
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  constructor(private readonly db: FakeDatabase) { setTimeout(() => this.oncomplete?.({}), 0); }
  objectStore(name: string): FakeStore {
    const data = this.db.stores.get(name);
    if (!data) throw new Error(`NotFoundError: ${name}`);
    return new FakeStore(data, this);
  }
}
export class FakeDatabase {
  stores = new Map<string, Map<string, unknown>>();
  closed = false;
  objectStoreNames = { contains: (n: string): boolean => this.stores.has(n) };
  constructor(readonly name: string) {}
  createObjectStore(name: string): void { this.stores.set(name, new Map()); }
  transaction(_names: string | string[], _mode?: string): FakeTx { return new FakeTx(this); }
  close(): void { this.closed = true; }
}
export class FakeIDBFactory {
  dbs = new Map<string, FakeDatabase>();
  open(name: string, _version?: number): FakeRequest<FakeDatabase> {
    const r = new FakeRequest<FakeDatabase>();
    later(() => {
      let db = this.dbs.get(name); const fresh = !db;
      if (!db) { db = new FakeDatabase(name); this.dbs.set(name, db); }
      r.result = db;
      if (fresh) r.onupgradeneeded?.({ target: r });
      r.onsuccess?.({ target: r });
    });
    return r;
  }
  deleteDatabase(name: string): FakeRequest<undefined> {
    const r = new FakeRequest<undefined>();
    later(() => { this.dbs.delete(name); r.onsuccess?.({ target: r }); });
    return r;
  }
}
export class FakeCaches {
  constructor(public names: string[]) {}
  async keys(): Promise<string[]> { return [...this.names]; }
  async delete(n: string): Promise<boolean> { const had = this.names.includes(n); this.names = this.names.filter((x) => x !== n); return had; }
}
