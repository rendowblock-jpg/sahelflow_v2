import { FakeDatabase, FakeIDBFactory, FakeRequest } from "./fake-idb";

// Models the one thing the plain fake leaves out: a database VERSION, and an upgrade when a higher one is asked for.
export class VersionedIDBFactory extends FakeIDBFactory {
  versions = new Map<string, number>();
  override open(name: string, version?: number): FakeRequest<FakeDatabase> {
    const r = new FakeRequest<FakeDatabase>();
    queueMicrotask(() => {
      let db = this.dbs.get(name); const had = this.versions.get(name) ?? 0; const want = version ?? 1;
      if (!db) { db = new FakeDatabase(name); this.dbs.set(name, db); }
      r.result = db;
      if (want > had) { this.versions.set(name, want); r.onupgradeneeded?.({ target: r }); }
      r.onsuccess?.({ target: r });
    });
    return r;
  }
}
