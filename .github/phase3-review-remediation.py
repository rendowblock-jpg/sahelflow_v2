from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement target, found {count}")
    write(path, content.replace(old, new, 1))


# P1: a committed storefront order must always converge on its idempotent
# order.created trigger, including command replay after response/dispatch loss.
replace_once(
    "src/app/api/storefront/submit/route.ts",
    '''  if (!command.replayed) {
    await dispatchTrigger(
      { prisma: db, shop: shopContext },
      "order.created" as TriggerEvent,
      command.result.automation,
      {
        triggerKey: `order.created:${command.result.order.id}`,
        occurredAt: command.result.order.createdAt,
      },
    );
  }
''',
    '''  await dispatchTrigger(
    { prisma: db, shop: shopContext },
    "order.created" as TriggerEvent,
    command.result.automation,
    {
      triggerKey: `order.created:${command.result.order.id}`,
      occurredAt: command.result.order.createdAt,
    },
  );
''',
)

# P1: fsync the parent directory after atomic spool record replacement/removal.
replace_once(
    "sidecars/whatsapp/inbound-spool.ts",
    '''function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function assertInboundMessage(message: IncomingMessage): void {
''',
    '''function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function syncDirectory(path: string): void {
  // Windows rename durability is owned by the filesystem/handle close contract.
  // POSIX filesystems require the parent directory entry to be flushed after an
  // atomic rename or unlink before the spool can be called power-loss durable.
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function assertInboundMessage(message: IncomingMessage): void {
''',
)
replace_once(
    "sidecars/whatsapp/inbound-spool.ts",
    '''    renameSync(temporary, target);
  }

  private removeRecord(record: StoredInboundRecord): void {
    rmSync(this.recordPath(record.envelope.spoolId), { force: true });
  }
''',
    '''    renameSync(temporary, target);
    syncDirectory(this.directory);
  }

  private removeRecord(record: StoredInboundRecord): void {
    rmSync(this.recordPath(record.envelope.spoolId), { force: true });
    syncDirectory(this.directory);
  }
''',
)

replace_once(
    "sidecars/whatsapp/inbound-spool-crypto.ts",
    '''function persistGeneratedKey(path: string, key: Buffer): void {
''',
    '''function syncParentDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function persistGeneratedKey(path: string, key: Buffer): void {
''',
)
replace_once(
    "sidecars/whatsapp/inbound-spool-crypto.ts",
    '''  renameSync(temporary, path);
}
''',
    '''  renameSync(temporary, path);
  syncParentDirectory(path);
}
''',
)

# P2: delayed provider events may increment unread truth but must not move the
# conversation's latest-message/SLA projection backwards.
replace_once(
    "src/lib/whatsapp/inbound-processor.ts",
    '''        update: {
          contactName,
          contactPhone,
          lastMessageAt: providerTimestamp,
          unreadCount: { increment: 1 },
          status: "open",
          snoozedUntil: null,
          waitingSince: providerTimestamp,
        },
        select: { id: true },
      });

      await tx.message.create({
''',
    '''        update: {
          contactName,
          contactPhone,
          unreadCount: { increment: 1 },
          status: "open",
          snoozedUntil: null,
        },
        select: { id: true },
      });

      await tx.conversation.updateMany({
        where: {
          id: conversation.id,
          OR: [
            { lastMessageAt: null },
            { lastMessageAt: { lt: providerTimestamp } },
          ],
        },
        data: {
          lastMessageAt: providerTimestamp,
          waitingSince: providerTimestamp,
        },
      });

      await tx.message.create({
''',
)

# P2: the editor must advertise only governed trigger and status values.
replace_once(
    "src/components/automations/automation-editor.tsx",
    '''  { value: "order.cancelled", labelKey: "automations.triggers.orderCancelled" },
  { value: "order.failed", labelKey: "automations.triggers.orderFailed" },
  {
''',
    '''  { value: "order.cancelled", labelKey: "automations.triggers.orderCancelled" },
  {
''',
)
replace_once(
    "src/components/automations/automation-editor.tsx",
    '''    | "returned"
    | "refused"
    | "cancelled"
    | "failed";
''',
    '''    | "returned"
    | "refused"
    | "cancelled";
''',
)
replace_once(
    "src/components/automations/automation-editor.tsx",
    '''  "returned",
  "refused",
  "cancelled",
  "failed",
] as const;
''',
    '''  "returned",
  "refused",
  "cancelled",
] as const;
''',
)

# P2: maxPages is a per-run safety budget, not an ignored UI parameter. A run
# that reaches the budget with a continuation cursor becomes a truthful partial
# result and never advances the integration watermark.
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''  continuationCursor: string | null;
  pagesFetched: number;
  attemptCount: number;
''',
    '''  continuationCursor: string | null;
  pagesPerCycle: number;
  pagesFetched: number;
  attemptCount: number;
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''      continuationCursor: candidate.continuationCursor,
      pagesFetched: candidate.pagesFetched,
      attemptCount: attemptNumber,
''',
    '''      continuationCursor: candidate.continuationCursor,
      pagesPerCycle: candidate.pagesPerCycle,
      pagesFetched: candidate.pagesFetched,
      attemptCount: attemptNumber,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''  const now = new Date();
  const candidateWatermark = maxCommerceWatermark(
''',
    '''  const now = new Date();
  const pageBudgetReached =
    page.nextCursor !== null && pageNumber >= run.pagesPerCycle;
  const candidateWatermark = maxCommerceWatermark(
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''        status: page.nextCursor ? "queued" : "processing",
        continuationCursor: page.nextCursor,
        candidateWatermark,
        pagesFetched: { increment: 1 },
        fetchedCount: { increment: descriptors.length },
        fetchComplete: page.nextCursor === null,
        hasMore: page.nextCursor !== null,
        leaseToken: null,
        lockedAt: null,
        nextAttemptAt: page.nextCursor ? now : null,
        lastErrorCode: null,
''',
    '''        status:
          page.nextCursor && !pageBudgetReached ? "queued" : "processing",
        continuationCursor: page.nextCursor,
        candidateWatermark,
        pagesFetched: { increment: 1 },
        fetchedCount: { increment: descriptors.length },
        fetchComplete: page.nextCursor === null || pageBudgetReached,
        hasMore: page.nextCursor !== null,
        leaseToken: null,
        lockedAt: null,
        nextAttemptAt:
          page.nextCursor && !pageBudgetReached ? now : null,
        lastErrorCode: pageBudgetReached
          ? "COMMERCE_PAGE_BUDGET_EXHAUSTED"
          : null,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''    const failed =
      (counts.get("quarantined") ?? 0) + (counts.get("dead_letter") ?? 0);
    if (failed > 0) {
''',
    '''    const failed =
      (counts.get("quarantined") ?? 0) + (counts.get("dead_letter") ?? 0);
    if (run.hasMore) {
      await context.prisma.commerceSyncRun.update({
        where: { id: run.id },
        data: {
          status: "partially_completed",
          activeKey: null,
          createdCount: created,
          updatedCount: updated,
          skippedCount: skipped,
          failedCount: failed,
          lastErrorCode: "COMMERCE_PAGE_BUDGET_EXHAUSTED",
          completedAt: new Date(),
          deadLetteredAt: null,
        },
      });
      finalized += 1;
      continue;
    }
    if (failed > 0) {
''',
)

# Update the existing pagination tests and add a direct budget regression.
commerce_test = "src/lib/integrations/ecommerce/__tests__/durable-runtime.test.ts"
content = read(commerce_test)
content = content.replace(
    'const queued = await queueCommerceSync(context, "shopify", 1);\n    const replay = await queueCommerceSync(context, "shopify", 1);',
    'const queued = await queueCommerceSync(context, "shopify", 2);\n    const replay = await queueCommerceSync(context, "shopify", 2);',
    1,
)
needle = '''  it("quarantines a catalog conflict and never advances the watermark", async () => {
'''
if content.count(needle) != 1:
    raise RuntimeError("commerce runtime test insertion point drifted")
budget_test = '''  it("stops at the requested page budget without advancing the watermark", async () => {
    fetchPageMock.mockResolvedValueOnce(
      page([], { nextCursor: "page-2", watermark: "wm-partial" }),
    );
    const queued = await queueCommerceSync(context, "shopify", 1);

    expect(await processNextCommerceFetch(context)).toBe(true);
    expect(await processNextCommerceFetch(context)).toBe(false);
    expect(await finalizeCommerceRuns(context)).toBe(1);

    const run = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(run).toMatchObject({
      status: "partially_completed",
      activeKey: null,
      fetchComplete: true,
      hasMore: true,
      pagesFetched: 1,
      continuationCursor: "page-2",
      lastErrorCode: "COMMERCE_PAGE_BUDGET_EXHAUSTED",
    });
    expect(fetchPageMock).toHaveBeenCalledTimes(1);
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integration.config ?? "{}")).toMatchObject({
      watermark: "",
    });
  });

'''
content = content.replace(needle, budget_test + needle, 1)
# The descending two-page watermark test must request two pages explicitly.
marker = '  it("retains the maximum candidate watermark across descending provider pages", async () => {'
start = content.index(marker)
segment = content[start:]
target = 'const queued = await queueCommerceSync(context, "shopify", 1);'
if segment.count(target) < 1:
    raise RuntimeError("descending watermark queue call drifted")
segment = segment.replace(target, 'const queued = await queueCommerceSync(context, "shopify", 2);', 1)
content = content[:start] + segment
write(commerce_test, content)

# Regression: delayed provider events cannot regress inbox ordering/SLA time.
whatsapp_test = "src/lib/whatsapp/__tests__/inbound-processor.integration.test.ts"
content = read(whatsapp_test)
needle = '''  it("recovers an expired pre-application lease with truthful immutable attempt history", async () => {
'''
if content.count(needle) != 1:
    raise RuntimeError("WhatsApp processor test insertion point drifted")
monotonic_test = '''  it("keeps the newest conversation timestamp when an older message arrives late", async () => {
    const newer = envelope("PROVIDER-INBOUND-NEWER");
    newer.message.messageTimestamp = 1_786_000_300;
    const older = envelope("PROVIDER-INBOUND-OLDER");
    older.message.messageTimestamp = 1_786_000_200;

    const newerIngress = await persistWhatsAppInbound(context, newer);
    await processWhatsAppInbound(context, newerIngress.ingressEventId);
    const olderIngress = await persistWhatsAppInbound(context, older);
    await processWhatsAppInbound(context, olderIngress.ingressEventId);

    const conversation = await db.conversation.findFirstOrThrow({
      select: {
        lastMessageAt: true,
        waitingSince: true,
        unreadCount: true,
      },
    });
    const expected = new Date(newer.message.messageTimestamp * 1_000);
    expect(conversation.lastMessageAt).toEqual(expected);
    expect(conversation.waitingSince).toEqual(expected);
    expect(conversation.unreadCount).toBe(2);
  });

'''
write(whatsapp_test, content.replace(needle, monotonic_test + needle, 1))

# Strengthen source contracts for the replay, fsync and governed UI boundaries.
source_test = "src/lib/integrations/__tests__/phase3-source-closure.test.ts"
content = read(source_test)
anchor = '''    const inboundSpool = source("sidecars/whatsapp/inbound-spool.ts");
'''
if content.count(anchor) != 1:
    raise RuntimeError("Phase 3 source test spool anchor drifted")
content = content.replace(
    anchor,
    anchor
    + '''    const inboundSpoolCrypto = source(
      "sidecars/whatsapp/inbound-spool-crypto.ts",
    );
    const storefrontSubmit = source(
      "src/app/api/storefront/submit/route.ts",
    );
    const automationEditor = source(
      "src/components/automations/automation-editor.tsx",
    );
''',
    1,
)
assertion_anchor = '''    expect(inboundSpool).toContain("sealWhatsAppInboundSpoolRecord");
'''
if content.count(assertion_anchor) != 1:
    raise RuntimeError("Phase 3 source test assertion anchor drifted")
content = content.replace(
    assertion_anchor,
    assertion_anchor
    + '''    expect(inboundSpool).toContain("syncDirectory(this.directory)");
    expect(inboundSpoolCrypto).toContain("syncParentDirectory(path)");
    expect(storefrontSubmit).not.toContain("if (!command.replayed)");
    expect(automationEditor).not.toContain('value: "order.failed"');
    expect(automationEditor).not.toContain('| "failed";');
''',
    1,
)
write(source_test, content)

print("Phase 3 review remediation applied")
