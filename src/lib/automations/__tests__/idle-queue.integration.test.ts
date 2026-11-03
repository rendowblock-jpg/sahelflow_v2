process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Idle-queue contract (F-0031): with nothing claimable the automation drains
 * must open ZERO interactive database transactions; with one claimable row each
 * claim must open exactly ONE and claim it exactly as before.
 *
 * Why it matters: Prisma on SQLite serves interactive transactions one at a
 * time through one connection, and the automation worker used to open three of
 * them every 2 s (lifecycle marker, trigger, run) only to find nothing.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { spyOnTransactions } from "@/lib/data/__tests__/transaction-spy";
import type { ServiceContext } from "@/lib/data/service-base";
import { AUTOMATION_TRIGGER_EFFECT_TYPE } from "../contracts";
import {
  claimLifecycleMarker,
  drainDueLifecycleTriggerBridges,
  LIFECYCLE_BRIDGE_EFFECT_TYPES,
} from "../lifecycle-bridge";
import { claimRun, drainDueAutomationRuns } from "../run-processor";
import {
  claimTrigger,
  drainDueAutomationTriggers,
} from "../trigger-processor";

const MINUTE = 60_000;
const LIFECYCLE_EFFECT = LIFECYCLE_BRIDGE_EFFECT_TYPES[0] ?? "order.fulfillment.shipped.v1";

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
  /** null = column null; past/future relative to now. */
  next?: "none" | "past" | "future";
  locked?: "none" | "fresh" | "expired";
  attemptCount?: number;
}

function when(kind: "none" | "past" | "future" | undefined): Date | null {
  if (kind === "past") return new Date(Date.now() - 10 * MINUTE);
  if (kind === "future") return new Date(Date.now() + 10 * MINUTE);
  return null;
}

function lockedAt(kind: "none" | "fresh" | "expired" | undefined): Date | null {
  if (kind === "fresh") return new Date();
  if (kind === "expired") return new Date(Date.now() - 10 * MINUTE);
  return null;
}

async function seedCommand(): Promise<string> {
  const id = `idleq-cmd-${randomUUID()}`;
  await rawDb.businessCommand.create({
    data: {
      id,
      idempotencyKey: id,
      commandType: "idleq.probe",
      aggregateType: "order",
      aggregateId: "idleq-order",
      requestHash: "a".repeat(64),
      status: "committed",
      actor: "idleq-test",
      correlationId: id,
      expectedVersion: 0,
      committedVersion: 1,
      committedAt: new Date(),
    },
  });
  return id;
}

async function seedIntent(effectType: string, state: RowState): Promise<string> {
  const commandId = await seedCommand();
  const id = `idleq-intent-${randomUUID()}`;
  await rawDb.outboxIntent.create({
    data: {
      id,
      effectKey: id,
      commandId,
      effectType,
      payloadJson: "sealed-not-opened-by-the-claim",
      status: state.status,
      attemptCount: state.attemptCount ?? 0,
      nextAttemptAt: when(state.next),
      lockedAt: lockedAt(state.locked),
      leaseToken: state.locked === undefined ? null : "old-lease",
    },
  });
  return id;
}

async function seedRun(state: RowState): Promise<string> {
  const id = `idleq-run-${randomUUID()}`;
  // AutomationRun.automationId is a real foreign key.
  const automation = await rawDb.automation.create({
    data: { name: "Idle probe", trigger: "order.created", action: "notify" },
  });
  await rawDb.automationRun.create({
    data: {
      id,
      runKey: id,
      automationId: automation.id,
      automationName: "Idle probe",
      triggerIntentId: "idleq-trigger-intent",
      triggerEffectKey: id,
      triggerType: "order.created",
      triggerKey: id,
      definitionHash: "d".repeat(64),
      definitionJson: "sealed-not-opened-by-the-claim",
      triggerPayloadJson: "sealed-not-opened-by-the-claim",
      triggerPayloadHash: "e".repeat(64),
      status: state.status,
      stepCount: 1,
      attemptCount: state.attemptCount ?? 0,
      nextAttemptAt: when(state.next),
      lockedAt: lockedAt(state.locked),
      leaseToken: state.locked === undefined ? null : "old-lease",
    },
  });
  return id;
}

/** States the shared claim where-clause must NOT match. */
const NOT_CLAIMABLE: RowState[] = [
  { label: "retrying, retry time in the future", status: "retrying", next: "future" },
  { label: "processing with a fresh lease", status: "processing", locked: "fresh" },
  { label: "succeeded", status: "succeeded" },
  { label: "dead_letter", status: "dead_letter" },
];

/** States the claim where-clause must match (the claim then runs unchanged). */
const CLAIMABLE: RowState[] = [
  { label: "queued", status: "queued" },
  { label: "retrying, no retry time", status: "retrying", next: "none" },
  { label: "retrying, retry time reached", status: "retrying", next: "past" },
  { label: "processing with an expired lease", status: "processing", locked: "expired" },
];

interface ClaimKind {
  name: string;
  claim: (context: ServiceContext) => Promise<unknown>;
  drain: (context: ServiceContext) => Promise<unknown[]>;
  seed: (state: RowState) => Promise<string>;
  read: (id: string) => Promise<{ status: string; attemptCount: number } | null>;
  extraNotClaimable: RowState[];
  extraClaimable: RowState[];
}

const KINDS: ClaimKind[] = [
  {
    name: "lifecycle marker",
    claim: claimLifecycleMarker,
    drain: (context) => drainDueLifecycleTriggerBridges(context, 10),
    seed: (state) => seedIntent(LIFECYCLE_EFFECT, state),
    read: (id) =>
      rawDb.outboxIntent.findUnique({
        where: { id },
        select: { status: true, attemptCount: true },
      }),
    extraNotClaimable: [],
    extraClaimable: [],
  },
  {
    name: "automation trigger",
    claim: claimTrigger,
    drain: (context) => drainDueAutomationTriggers(context, 10),
    seed: (state) => seedIntent(AUTOMATION_TRIGGER_EFFECT_TYPE, state),
    read: (id) =>
      rawDb.outboxIntent.findUnique({
        where: { id },
        select: { status: true, attemptCount: true },
      }),
    extraNotClaimable: [],
    extraClaimable: [],
  },
  {
    name: "automation run",
    claim: claimRun,
    drain: (context) => drainDueAutomationRuns(context, 10),
    seed: seedRun,
    read: (id) =>
      rawDb.automationRun.findUnique({
        where: { id },
        select: { status: true, attemptCount: true },
      }),
    extraNotClaimable: [
      { label: "waiting, wake time in the future", status: "waiting", next: "future" },
      {
        label: "waiting_effect, wake time in the future",
        status: "waiting_effect",
        next: "future",
      },
    ],
    extraClaimable: [
      { label: "waiting, wake time reached", status: "waiting", next: "past" },
      { label: "waiting_effect, no wake time", status: "waiting_effect", next: "none" },
    ],
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
    expect(await kind.drain(context)).toEqual([]);

    expect(transactions()).toBe(0);
  });

  it.each([...NOT_CLAIMABLE, ...kind.extraNotClaimable])(
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

  it.each([...CLAIMABLE, ...kind.extraClaimable])(
    "a claimable row ($label) opens exactly one transaction and is claimed once",
    async (state) => {
      const id = await kind.seed(state);
      const { context, transactions } = spiedContext();

      const claimed = await kind.claim(context);

      expect(claimed).toMatchObject({ id, status: "processing", attemptCount: 1 });
      expect(transactions()).toBe(1);
      expect(await kind.read(id)).toEqual({ status: "processing", attemptCount: 1 });
    },
  );

  it("two concurrent callers with one claimable row: exactly one wins", async () => {
    const id = await kind.seed({ label: "queued", status: "queued" });
    const { context } = spiedContext();

    const results = await Promise.all([kind.claim(context), kind.claim(context)]);

    expect(results.filter((claimed) => claimed !== null)).toHaveLength(1);
    expect(await kind.read(id)).toEqual({ status: "processing", attemptCount: 1 });
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

describe("idle queue: outbox rows of the other consumer are ignored", () => {
  it("a queued trigger intent does not wake the lifecycle claim, and vice versa", async () => {
    await seedIntent(AUTOMATION_TRIGGER_EFFECT_TYPE, { label: "q", status: "queued" });
    await seedIntent("some.other.effect.v1", { label: "q", status: "queued" });
    const lifecycle = spiedContext();
    expect(await claimLifecycleMarker(lifecycle.context)).toBeNull();
    expect(lifecycle.transactions()).toBe(0);

    await cleanDb();
    await seedIntent(LIFECYCLE_EFFECT, { label: "q", status: "queued" });
    const trigger = spiedContext();
    expect(await claimTrigger(trigger.context)).toBeNull();
    expect(trigger.transactions()).toBe(0);
  });
});

describe("idle queue: attempt cap still dead-letters inside the one transaction", () => {
  it.each([
    ["lifecycle marker", claimLifecycleMarker, LIFECYCLE_EFFECT],
    ["automation trigger", claimTrigger, AUTOMATION_TRIGGER_EFFECT_TYPE],
  ] as const)("%s", async (_name, claim, effectType) => {
    const id = await seedIntent(effectType, {
      label: "exhausted",
      status: "retrying",
      next: "past",
      attemptCount: 6,
    });
    const { context, transactions } = spiedContext();

    expect(await claim(context)).toBeNull();

    expect(transactions()).toBe(1);
    expect(
      await rawDb.outboxIntent.findUnique({
        where: { id },
        select: { status: true, attemptCount: true },
      }),
    ).toEqual({ status: "dead_letter", attemptCount: 6 });
  });
});
