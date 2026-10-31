// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildPhotoStatus, hashPhoto } from "../media-host";
import { createMediaLedger, type MediaLedgerDb } from "../media-ledger";

const cwd = mkdtempSync(join(tmpdir(), "w3a-status-"));
const dir = join(cwd, "public", "uploads", "shop_1");
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

function fakeDb() {
  const rows = new Map<string, string>();
  const db: MediaLedgerDb = {
    setting: {
      async findUnique({ where }) { const value = rows.get(where.key); return value === undefined ? null : { value }; },
      async findMany({ where }) { return where.key.in.filter((key) => rows.has(key)).map((key) => ({ key, value: rows.get(key) ?? "" })); },
      async upsert({ where, create, update }) { rows.set(where.key, rows.has(where.key) ? update.value : create.value); return {}; },
    },
  };
  return { db, rows };
}
const NOW = new Date("2026-10-31T12:00:00.000Z");
const write = (name: string, text: string) => { writeFileSync(join(dir, name), text); return hashPhoto(Buffer.from(text)); };
const base = { shopId: "shop 1", cwd, now: NOW };

describe("buildPhotoStatus", () => {
  it("gives each photo one honest state", async () => {
    const hosted = write("hosted.webp", "hosted-bytes");
    write("waiting.webp", "waiting-bytes");
    const { db } = fakeDb();
    const ledger = createMediaLedger(db, () => new Date(NOW.getTime() - 3_600_000));
    await ledger.recordHosted("sf_a", hosted);
    await ledger.recordService("on");
    const status = await buildPhotoStatus({
      ...base, storefrontId: "sf_a", ledger,
      products: [
        { id: "h", images: "/uploads/shop_1/hosted.webp" },
        { id: "w", images: "/uploads/shop_1/waiting.webp" },
        { id: "m", images: "/uploads/shop_1/gone.webp" },
        { id: "l", images: "https://x.test/a.jpg" },
        { id: "x", images: "http://old.test/a.jpg" },
        { id: "n", images: null },
        { id: "o", images: "/uploads/shop_2/other.webp" },
      ],
    });
    expect(status.products.h?.[0]?.state).toBe("hosted");
    expect(status.products.w?.[0]?.state).toBe("waiting");
    expect(status.products.m?.[0]?.state).toBe("missing");
    expect(status.products.l?.[0]?.state).toBe("link");
    expect(status.products.o?.[0]?.state).toBe("missing");
    expect(Object.keys(status.products)).not.toContain("n");
    expect(Object.keys(status.products)).not.toContain("x");
    expect(JSON.stringify(status)).not.toContain(hosted);
  });

  it("says 'only on this PC' when hosting is off, unknown or the answer is older than 24 hours", async () => {
    write("pc.webp", "pc-bytes");
    const products = [{ id: "p", images: "/uploads/shop_1/pc.webp" }];
    const stateFor = async (setup: (ledger: ReturnType<typeof createMediaLedger>) => Promise<void>) => {
      const { db } = fakeDb();
      const ledger = createMediaLedger(db, () => new Date(NOW.getTime() - 3_600_000));
      await setup(ledger);
      return (await buildPhotoStatus({ ...base, storefrontId: "sf_a", products, ledger })).products.p?.[0]?.state;
    };
    expect(await stateFor(async () => {})).toBe("local-only");
    expect(await stateFor((l) => l.recordService("off"))).toBe("local-only");
    const stale = fakeDb();
    const staleLedger = createMediaLedger(stale.db, () => new Date(NOW.getTime() - 25 * 3_600_000));
    await staleLedger.recordService("on");
    expect((await buildPhotoStatus({ ...base, storefrontId: "sf_a", products, ledger: staleLedger })).products.p?.[0]?.state).toBe("local-only");
    expect(await stateFor((l) => l.recordService("on"))).toBe("waiting");
  });

  it("does not count another storefront's upload as hosted", async () => {
    const hash = write("two-stores.webp", "two-stores-bytes");
    const { db } = fakeDb();
    const ledger = createMediaLedger(db, () => NOW);
    await ledger.recordHosted("sf_b", hash);
    await ledger.recordService("on");
    const status = await buildPhotoStatus({ ...base, storefrontId: "sf_a", ledger, products: [{ id: "p", images: "/uploads/shop_1/two-stores.webp" }] });
    expect(status.products.p?.[0]?.state).toBe("waiting");
  });

  it("notices a photo that was replaced on disk", async () => {
    const hash = write("swap.webp", "first-version");
    const { db } = fakeDb();
    const ledger = createMediaLedger(db, () => NOW);
    await ledger.recordHosted("sf_a", hash);
    const products = [{ id: "p", images: "/uploads/shop_1/swap.webp" }];
    expect((await buildPhotoStatus({ ...base, storefrontId: "sf_a", ledger, products })).products.p?.[0]?.state).toBe("hosted");
    write("swap.webp", "second-version-is-longer");
    expect((await buildPhotoStatus({ ...base, storefrontId: "sf_a", ledger, products })).products.p?.[0]?.state).toBe("local-only");
  });
});
