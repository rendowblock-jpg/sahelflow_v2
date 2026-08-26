import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, shopContext } from "@/lib/db";
import { whatsAppMediaRoot } from "../media-object-store";
import { reconcileAbandonedWhatsAppMediaTemps } from "../media-temp-reconciliation";

const context = { prisma: db, shop: shopContext } as const;
let testRoot = "";

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-media-temp-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
});

describe("WhatsApp media crash-temp reconciliation", () => {
  it("removes only exact abandoned temp objects and preserves committed files", () => {
    const root = whatsAppMediaRoot(context);
    mkdirSync(root, { recursive: true });
    const objectId = "a".repeat(64);
    const committed = join(root, `${objectId}.sfmedia`);
    const abandoned = join(
      root,
      `.${objectId}.${process.pid}.abcdef123456.tmp`,
    );
    const unrelated = join(root, ".operator-note.tmp");
    writeFileSync(committed, "committed-ciphertext");
    writeFileSync(abandoned, "abandoned-ciphertext");
    writeFileSync(unrelated, "not-owned-by-media-store");

    expect(reconcileAbandonedWhatsAppMediaTemps(context, 1_000_000)).toBe(1);
    expect(existsSync(abandoned)).toBe(false);
    expect(existsSync(committed)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);

    expect(reconcileAbandonedWhatsAppMediaTemps(context, 1_000_001)).toBe(0);
  });

  it("fails closed instead of following a temp-shaped directory", () => {
    const root = whatsAppMediaRoot(context);
    mkdirSync(root, { recursive: true });
    const unsafe = join(
      root,
      `.${"b".repeat(64)}.${process.pid}.abcdef123456.tmp`,
    );
    mkdirSync(unsafe);

    expect(() =>
      reconcileAbandonedWhatsAppMediaTemps(context, 2_000_000),
    ).toThrow("not a safe regular file");
    expect(existsSync(unsafe)).toBe(true);
  });
});
