/**
 * Test-only: the storefront Worker's D1 interface backed by a real in-memory
 * SQLite database that carries the real schema.sql, so SQL, triggers and
 * constraints behave as they do in production.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { D1Database, D1Statement, StorefrontWorkerEnvironment } from "./types";

const { DatabaseSync: SqliteDatabase } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSync;
};

export const TEST_WORKSPACE_ID = "0123456789abcdef0123456789abcdef";

export function openDatabase(): DatabaseSync {
  const database = new SqliteDatabase(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(readFileSync(join(process.cwd(), "control-plane/storefront/schema.sql"), "utf8"));
  return database;
}

class SqliteStatement implements D1Statement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1Statement {
    const statement = new SqliteStatement(this.database, this.sql);
    statement.values = values.map((value): SQLInputValue => {
      if (value == null) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
      if (value instanceof Uint8Array) return value;
      throw new Error("Unsupported D1 bind value");
    });
    return statement;
  }

  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ success: boolean; results?: T[] }> {
    return {
      success: true,
      results: this.database.prepare(this.sql).all(...this.values) as T[],
    };
  }

  async run(): Promise<{ success: boolean; meta?: { changes?: number; last_row_id?: number } }> {
    const outcome = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: Number(outcome.changes), last_row_id: Number(outcome.lastInsertRowid) },
    };
  }
}

export function d1(database: DatabaseSync): D1Database {
  return {
    prepare(query: string): D1Statement {
      return new SqliteStatement(database, query);
    },
    async batch(statements: D1Statement[]) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export function environment(database: DatabaseSync): StorefrontWorkerEnvironment {
  return {
    DB: d1(database),
    CONTROL: {
      fetch: async () => Response.json({ workspaceId: TEST_WORKSPACE_ID, shopSlots: 1 }),
    },
    CHECKOUT_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
}
