process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Idle-queue contract (F-0031) for the commerce-sync runtime: a seller with no
 * store connected (or nothing due) must cost ZERO interactive transactions per
 * tick; one claimable run or item must cost exactly ONE, claimed as before.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { spyOnTransactions } from "@/lib/data/__tests__/transaction-spy";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  claimCommerceItem,
  claimCommerceRun,
  drainCommerceRuntime,
  finalizeCommerceRuns,
  processNextCommerceFetch,
  processNextCommerceItem,
} from "../processor";

const MINUTE = 60_000;

function spiedContext(): {
  context: ServiceContext;
  transactions: () => number;
} {
  const spy = spyOnTransactions(rawDb);
  return {
    context: { prisma: spy.client as never, shop: TEST_SHOP_CONTEXT },
    transactions: spy.transactions,
  };
}

interface RowState {
  label: string;
  status: string;
  next?: "none" | "past" | "future";
  locked?: "none" | "fresh" | "expired";
  fetchComplete?: boolean;
}

function when(kind: RowState["next"]): Date | null {
  if (kind === "past") return new Date(Date.now() - 10 * MINUTE);
  if (kind === "future") return new Date(Date.now() + 10 * MINUTE);
  return null;
}

function lockedAt(kind: RowState["locked"]): Date | null {
  if (kind === "fresh") return new Date();
  if (kind === "expired") return new Date(Date.now() - 10 * MINUTE);
  return null;
}

async function seedRun(state: RowState): Promise<string> {
  const id = `idleq-run-${randomUUID()}`;
  await rawDb.commerceSyncRun.create({
    data: {
      id,
      runKey: id,
      platform: "shopify",
      integrationId: "idleq-integration",
      sourceIdentity: "idleq-source",
      initialWatermark: "",
      status: state.status,
      fetchComplete: state.fetchComplete ?? false,
      nextAttemptAt: when(state.next),
      lockedAt: lockedAt(state.locked),
      leaseToken: state.locked === undefined ? null : "old-lease",
    },
  });
  return id;
}

async function seedItem(state: RowState): Promise<string> {
  const runId = await seedRun({
    label: "parent",
    status: "fetching",
    fetchComplete: true,
  });
  const page = await rawDb.commerceSyncPage.create({
    data: {
      id: `idleq-page-${randomUUID()}`,
      pageKey: `idleq-page-${randomUUID()}`,
      runId,
      pageNumber: 1,
      itemCount: 1,
      pageHash: "f".repeat(64),
    },
  });
  const id = `idleq-item-${randomUUID()}`;
  await rawDb.commerceSyncItem.create({
    data: {
      id,
      itemKey: id,
      runId,
      pageId: page.id,
      platform: "shopify",
      sourceOrderId: id,
      sourceRevision: "rev-1",
      payloadJson: "sealed-not-opened-by-the-claim",
      payloadHash: "a".repeat(64),
      status: state.status,
      nextAttemptAt: when(state.next),
      lockedAt: lockedAt(state.locked),
      leaseToken: state.locked === undefined ? null : "old-lease",
    },
  });
  return id;
}

const NOT_CLAIMABLE: RowState[] = [
  { label: "retrying, retry time in the future", status: "retrying", next: "future" },
  { label: "succeeded", status: "succeeded" },
  { label: "dead_letter", status: "dead_letter" },
];

const CLAIMABLE: RowState[] = [
  { label: "queued", status: "queued" },
  { label: "retrying, no retry time", status: "retrying", next: "none" },
  { label: "retrying, retry time reached", status: "retrying", next: "past" },
];

/**
 * A context whose `$transaction` first lets `beforeTransaction` run, i.e. a
 * competitor that claims the row AFTER the pre-check saw it and BEFORE the
 * transaction starts.
 */
function racingContext(beforeTransaction: () => Promise<void>): ServiceContext {
  const client = new Proxy(rawDb, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "$transaction") {
        return async (...args: unknown[]) => {
          await beforeTransaction();
          return (value as (...inner: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
  return { prisma: client as never, shop: TEST_SHOP_CONTEXT };
}

interface ClaimKind {
  name: string;
  claim: (context: ServiceContext) => Promise<unknown>;
  processNext: (context: ServiceContext) => Promise<boolean>;
  seed: (state: RowState) => Promise<string>;
  read: (id: string) => Promise<{ status: string; attemptCount: number } | null>;
  /** status a claimed row must have, and the stale-lease state that is claimable */
  claimedStatus: string;
  staleStatus: string;
  /** What a competing worker does to the row: claims it with a fresh lease. */
  steal: (id: string) => Promise<unknown>;
  extraNotClaimable: RowState[];
}

const KINDS: ClaimKind[] = [
  {
    name: "commerce fetch run",
    claim: claimCommerceRun,
    processNext: processNextCommerceFetch,
    seed: seedRun,
    read: (id) =>
      rawDb.commerceSyncRun.findUnique({
        where: { id },
        select: { status: true, attemptCount: true },
      }),
    claimedStatus: "fetching",
    staleStatus: "fetching",
    steal: (id) =>
      rawDb.commerceSyncRun.update({
        where: { id },
        data: { status: "fetching", attemptCount: 1, lockedAt: new Date(), leaseToken: "rival" },
      }),
    extraNotClaimable: [
      {
        label: "queued but the fetch is already complete",
        status: "queued",
        fetchComplete: true,
      },
    ],
  },
  {
    name: "commerce item",
    claim: claimCommerceItem,
    processNext: processNextCommerceItem,
    seed: seedItem,
    read: (id) =>
      rawDb.commerceSyncItem.findUnique({
        where: { id },
        select: { status: true, attemptCount: true },
      }),
    claimedStatus: "processing",
    staleStatus: "processing",
    steal: (id) =>
      rawDb.commerceSyncItem.update({
        where: { id },
        data: { status: "processing", attemptCount: 1, lockedAt: new Date(), leaseToken: "rival" },
      }),
    extraNotClaimable: [{ label: "quarantined", status: "quarantined" }],
  },
];

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe.each(KINDS)("idle queue: $name claim", (kind) => {
  it("an empty database opens zero transactions and claims nothing", async () => {
    const { context, transactions } = spiedContext();

    expect(await kind.claim(context)).toBeNull();
    expect(await kind.processNext(context)).toBe(false);

    expect(transactions()).toBe(0);
  });

  it.each([
    ...NOT_CLAIMABLE,
    ...kind.extraNotClaimable,
    { label: "stale status with a fresh lease", status: kind.staleStatus, locked: "fresh" } as RowState,
  ])(
    "a row that is not claimable ($label) opens zero transactions and is left untouched",
    async (state) => {
      const id = await kind.seed(state);
      const before = await kind.read(id);
      const { context, transactions } = spiedContext();

      expect(await kind.claim(context)).toBeNull();

      expect(transactions()).toBe(0);
      expect(await kind.read(id)).toEqual(before);
    },
  );

  it.each([
    ...CLAIMABLE,
    { label: "expired lease", status: kind.staleStatus, locked: "expired" } as RowState,
  ])(
    "a claimable row ($label) opens exactly one transaction and is claimed once",
    async (state) => {
      const id = await kind.seed(state);
      const { context, transactions } = spiedContext();

      const claimed = await kind.claim(context);

      expect(claimed).toMatchObject({ id, attemptCount: 1 });
      expect(transactions()).toBe(1);
      expect(await kind.read(id)).toEqual({
        status: kind.claimedStatus,
        attemptCount: 1,
      });
    },
  );

  it("two concurrent callers with one claimable row: exactly one wins", async () => {
    const id = await kind.seed({ label: "queued", status: "queued" });
    const { context } = spiedContext();

    const results = await Promise.all([kind.claim(context), kind.claim(context)]);

    expect(results.filter((claimed) => claimed !== null)).toHaveLength(1);
    expect(await kind.read(id)).toEqual({
      status: kind.claimedStatus,
      attemptCount: 1,
    });
  });

  it("the transaction re-checks inside: a row claimed by a rival after the pre-check is not claimed again", async () => {
    const id = await kind.seed({ label: "queued", status: "queued" });
    const context = racingContext(async () => {
      await kind.steal(id);
    });

    expect(await kind.claim(context)).toBeNull();

    expect(await kind.read(id)).toEqual({
      status: kind.claimedStatus,
      attemptCount: 1,
    });
  });

  it("claims the oldest claimable row first (ordering unchanged)", async () => {
    const first = await kind.seed({ label: "queued", status: "queued" });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await kind.seed({ label: "queued", status: "queued" });
    const { context } = spiedContext();

    expect(await kind.claim(context)).toMatchObject({ id: first });
    expect(await kind.claim(context)).toMatchObject({ id: second });
    expect(await kind.claim(context)).toBeNull();
  });
});

describe("idle queue: finalize and the whole commerce drain", () => {
  it("finalizeCommerceRuns on an empty database stays a plain read (zero transactions)", async () => {
    const { context, transactions } = spiedContext();

    expect(await finalizeCommerceRuns(context, 10)).toBe(0);

    expect(transactions()).toBe(0);
  });

  it("drainCommerceRuntime on an empty database does nothing and opens zero transactions", async () => {
    const { context, transactions } = spiedContext();

    expect(
      await drainCommerceRuntime(context, {
        fetches: 2,
        items: 20,
        finalizations: 10,
      }),
    ).toEqual({ fetches: 0, items: 0, finalizations: 0 });

    expect(transactions()).toBe(0);
  });
});
