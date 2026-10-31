// A minimal D1 look-alike over node:sqlite (built into Node 22), so the relay
// worker can be driven end to end in vitest with a real SQL engine and no
// dependency. It implements only what worker.ts uses: prepare().bind() with
// first/all/run, and batch() (one transaction, rolled back on error).
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectedWorkerEnvironment } from "../worker";

type SqliteStatement = {
  all: (...values: unknown[]) => unknown[];
  get: (...values: unknown[]) => unknown;
  run: (...values: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
};
export type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
};

// createRequire keeps Vite from trying to resolve the "node:"-only built-in.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (location: string) => SqliteDatabase;
};

export type D1LogEntry = { kind: "first" | "all" | "run"; sql: string; changes: number | null };

export function createTestD1(options: { yieldBetween?: boolean } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const log: D1LogEntry[] = [];
  // With yieldBetween every statement hands the event loop back first, so two
  // requests really interleave between statements the way two Workers would.
  const tick = async () => {
    if (options.yieldBetween) await new Promise<void>((resolve) => setImmediate(resolve));
  };

  class Statement {
    constructor(readonly sql: string, readonly values: unknown[] = []) {}

    bind(...values: unknown[]) {
      return new Statement(this.sql, values);
    }

    async first<T>(): Promise<T | null> {
      await tick();
      const row = sqlite.prepare(this.sql).get(...this.values);
      log.push({ kind: "first", sql: this.sql, changes: null });
      return row === undefined || row === null ? null : ({ ...(row as object) } as T);
    }

    async all<T>() {
      await tick();
      const rows = sqlite.prepare(this.sql).all(...this.values) as object[];
      log.push({ kind: "all", sql: this.sql, changes: null });
      return { success: true, results: rows.map((row) => ({ ...row }) as T) };
    }

    runNow() {
      const result = sqlite.prepare(this.sql).run(...this.values);
      const changes = Number(result.changes);
      log.push({ kind: "run", sql: this.sql, changes });
      return { success: true, meta: { changes, last_row_id: Number(result.lastInsertRowid) } };
    }

    async run() {
      await tick();
      return this.runNow();
    }
  }

  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: unknown[]) => {
      await tick();
      sqlite.exec("BEGIN");
      try {
        const results = (statements as Statement[]).map((statement) => statement.runNow());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };

  return { sqlite, log, db: db as unknown as ConnectedWorkerEnvironment["DB"] };
}

export type TestD1 = ReturnType<typeof createTestD1>;

const CONNECTED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** schema.sql first, then every migration. schema.sql is the full current
 * schema, so a migration that only adds a column it already has is skipped. */
export function loadRelaySchema(sqlite: SqliteDatabase): void {
  sqlite.exec(readFileSync(path.join(CONNECTED_DIR, "schema.sql"), "utf8"));
  const migrations = readdirSync(path.join(CONNECTED_DIR, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    try {
      sqlite.exec(readFileSync(path.join(CONNECTED_DIR, "migrations", name), "utf8"));
    } catch (error) {
      if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
    }
  }
}
