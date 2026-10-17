import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { STOREFRONT_HOLD_KEY_PREFIXES } from "../stock-availability";

/**
 * Pins the complete set of producers of an active InventoryReservation, which
 * is what makes the availability rule in stock-availability.ts safe.
 *
 * The rule treats a hold as "already out of Product.stock / ProductVariant.stock"
 * only when the command that opened it also wrote a 'reserve' InventoryMovement
 * for it and the key is not a storefront key. That is true of exactly one
 * producer (manual confirmation). If someone adds a producer, or makes another
 * one emit 'reserve', this file fails until the new producer has been classified
 * on purpose instead of being silently counted as "stock already lowered".
 *
 * It reads source text, so it runs without a database.
 */

const ROOT = process.cwd();

const CONTRACTS = "src/lib/business-truth/contracts.ts";
const KERNEL = "src/lib/business-truth/command-kernel.ts";
const MANUAL = "src/lib/orders/manual-confirmation.ts";
const DELEGATION = "src/lib/connected-platform/storefront-delegation.ts";
const ROLLBACK = "src/lib/connected-platform/storefront-rollback.ts";
const GUARD_MIGRATION =
  "prisma/migrations/20260814030000_storefront_delegation_guards/migration.sql";

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      files.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Non-test source with comment-only lines removed, keyed by posix path. */
const SOURCES = new Map<string, string>(
  listSourceFiles(join(ROOT, "src")).map((file) => {
    const code = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !(
          trimmed.startsWith("//") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("*")
        );
      })
      .join("\n");
    return [relative(ROOT, file).split(sep).join("/"), code] as const;
  }),
);

function occurrences(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, "g")) ?? []).length;
}

/** Files (path -> match count) whose non-comment source matches `pattern`. */
function filesMatching(pattern: RegExp): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [path, code] of SOURCES) {
    const count = occurrences(code, pattern);
    if (count > 0) result[path] = count;
  }
  return result;
}

function source(path: string): string {
  const code = SOURCES.get(path);
  if (code === undefined) throw new Error(`${path} is not a source file under src/`);
  return code;
}

describe("producers of an active InventoryReservation", () => {
  it("opens reservations in exactly the four known places (plus the type declaration)", () => {
    expect(filesMatching(/operation\s*:\s*["']open["']/)).toEqual({
      [CONTRACTS]: 1,
      [MANUAL]: 1,
      [DELEGATION]: 2,
      [ROLLBACK]: 1,
    });
  });

  it("builds open facts only in files that name OpenReservationFact", () => {
    expect(Object.keys(filesMatching(/\bOpenReservationFact\b/)).sort()).toEqual(
      [CONTRACTS, MANUAL, DELEGATION, ROLLBACK].sort(),
    );
  });

  it("has one SQL insert (the command kernel) and no ORM create path", () => {
    expect(filesMatching(/INSERT\s+INTO\s+"?InventoryReservation"?/)).toEqual({
      [KERNEL]: 1,
    });
    expect(
      filesMatching(/inventoryReservation\s*\.\s*(?:create|createMany|upsert)\s*\(/),
    ).toEqual({});
  });

  it("emits a 'reserve' movement only from manual confirmation", () => {
    expect(filesMatching(/movementType\s*:\s*["']reserve["']/)).toEqual({
      [MANUAL]: 1,
    });
  });

  it("gives every manual hold a key that cannot be taken for a storefront key", () => {
    expect(source(MANUAL)).toContain(
      'reservationKey: `${commandId}:reserve:${item.id}`',
    );
  });

  it("keeps every storefront hold under the key prefixes the rule and the database guard share", () => {
    for (const prefix of STOREFRONT_HOLD_KEY_PREFIXES) {
      expect(source(DELEGATION), `${prefix} in storefront-delegation`).toContain(
        `"${prefix}"`,
      );
    }
    expect(source(ROLLBACK)).toContain('"storefront-provisional:"');

    const guard = readFileSync(join(ROOT, GUARD_MIGRATION), "utf8");
    for (const prefix of STOREFRONT_HOLD_KEY_PREFIXES) {
      // One clause in the Product trigger and one in the ProductVariant trigger.
      expect(occurrences(guard, new RegExp(`LIKE '${prefix}%'`))).toBe(2);
    }
  });

  it("makes manual confirmation read the opening command's reserve movement in both SQL branches", () => {
    const manual = source(MANUAL);
    for (const clause of [
      /m\."commandId" = r\."createdByCommandId"/,
      /m\."reservationId" = r\."id"/,
      /m\."movementType" = 'reserve'/,
    ]) {
      expect(occurrences(manual, clause), String(clause)).toBe(2);
    }
  });

  it("no longer sums every active hold against stock that the confirmation already lowered", () => {
    expect(source(MANUAL)).not.toMatch(/COALESCE\(SUM\("quantity"\), 0\)/);
  });
});
