import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import worker from "./worker";
import { KEEP_BY_CLASS } from "./retention";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

const schema = read("./schema.sql");
const migration = read("./migrations/0004_quota_rotation.sql");

function triggerBody(sql: string): string {
  const match = /CREATE TRIGGER (?:IF NOT EXISTS )?cloud_backup_entitlement_guard\n([\s\S]*?)\nEND;/.exec(sql);
  if (!match?.[1]) throw new Error("trigger not found");
  return match[1].replace(/\s+/g, " ").trim();
}

describe("the quota rule repeats the retention numbers (drift guard)", () => {
  // The rule exempts the points retention will retire once a new backup
  // verifies. It states them as keep - 1 in SQL, so this fails if either side moves.
  for (const [label, sql] of [["schema.sql", schema], ["migration 0004", migration]] as const) {
    it(`${label} says keep - 1 for every rotating class`, () => {
      const body = triggerBody(sql);
      for (const retentionClass of ["daily", "weekly", "monthly"] as const) {
        expect(body, `${label}: ${retentionClass}`).toContain(
          `WHEN '${retentionClass}' THEN ${KEEP_BY_CLASS[retentionClass] - 1}`,
        );
      }
      // a trial keeps one point, so its allowance is the ELSE branch: keep - 1 = 0
      expect(KEEP_BY_CLASS.trial - 1).toBe(0);
      expect(body).toContain("ELSE 0 END");
    });

    it(`${label} treats exactly the rotating classes as rotating`, () => {
      const listed = /NEW\.retention_class IN \(([^)]*)\)/.exec(triggerBody(sql))?.[1] ?? "";
      const classes = listed.split(",").map((part) => part.trim().replace(/'/g, "")).sort();
      expect(classes).toEqual(Object.keys(KEEP_BY_CLASS).sort());
    });
  }

  it("schema.sql carries the very same trigger as migration 0004", () => {
    expect(triggerBody(schema)).toBe(triggerBody(migration));
  });
});

describe("the Worker runs scheduled maintenance", () => {
  it("exposes fetch and scheduled, and hands the work to waitUntil", async () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof worker.scheduled).toBe("function");
    const waited: Promise<unknown>[] = [];
    const statement = {
      bind: () => statement,
      all: async () => ({ success: true, results: [] }),
      first: async () => null,
      run: async () => ({ success: true, meta: { changes: 0 } }),
    };
    const environment = {
      DB: { prepare: vi.fn(() => statement), batch: async () => [] },
      BACKUPS: { delete: vi.fn(), head: vi.fn(), get: vi.fn(), put: vi.fn(), list: vi.fn() },
      PRODUCT_MAJOR: "1",
      SF_LICENSE_TRIAL_PUBLIC_KEYS: "{}",
      SF_LICENSE_PERMANENT_PUBLIC_KEYS: "{}",
    };
    worker.scheduled({}, environment as never, { waitUntil: (promise) => { waited.push(promise); } });
    expect(waited).toHaveLength(1);
    await expect(waited[0]).resolves.toMatchObject({
      abandonedReleased: 0,
      trialBackupsPurged: 0,
      trialBackupsIncomplete: 0,
      failedSteps: 0,
    });
    // an empty database is looked at, never written to
    expect(environment.BACKUPS.delete).not.toHaveBeenCalled();
  });
});

describe("the deployment template schedules the maintenance", () => {
  it("lists a cron trigger", () => {
    expect(read("./wrangler.jsonc.example")).toMatch(/"crons"\s*:\s*\[\s*"[^"]+"/);
  });
});
