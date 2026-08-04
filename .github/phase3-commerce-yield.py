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


processor = "src/lib/integrations/ecommerce/processor.ts"
replace_once(
    processor,
    '''  const pageBudgetReached =
    page.nextCursor !== null && pageNumber >= run.pagesPerCycle;
''',
    '''  const pageBudgetReached =
    page.nextCursor !== null && pageNumber % run.pagesPerCycle === 0;
''',
)
replace_once(
    processor,
    '''        status: page.nextCursor && !pageBudgetReached ? "queued" : "processing",
        continuationCursor: page.nextCursor,
        candidateWatermark,
        pagesFetched: { increment: 1 },
        fetchedCount: { increment: descriptors.length },
        fetchComplete: page.nextCursor === null || pageBudgetReached,
        hasMore: page.nextCursor !== null,
        leaseToken: null,
        lockedAt: null,
        nextAttemptAt: page.nextCursor && !pageBudgetReached ? now : null,
        lastErrorCode: pageBudgetReached
          ? "COMMERCE_PAGE_BUDGET_EXHAUSTED"
          : null,
''',
    '''        status: page.nextCursor ? "queued" : "processing",
        continuationCursor: page.nextCursor,
        candidateWatermark,
        pagesFetched: { increment: 1 },
        fetchedCount: { increment: descriptors.length },
        fetchComplete: page.nextCursor === null,
        hasMore: page.nextCursor !== null,
        leaseToken: null,
        lockedAt: null,
        nextAttemptAt: page.nextCursor
          ? pageBudgetReached
            ? new Date(now.getTime() + 5_000)
            : now
          : null,
        lastErrorCode: null,
''',
)
replace_once(
    processor,
    '''    if (run.hasMore) {
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
''',
    '''''',
)

commerce_test = "src/lib/integrations/ecommerce/__tests__/durable-runtime.test.ts"
content = read(commerce_test)
start = content.index(
    '  it("stops at the requested page budget without advancing the watermark"'
)
end = content.index(
    '  it("quarantines a catalog conflict and never advances the watermark"',
    start,
)
replacement = '''  it("yields at the requested page budget and resumes from the same cursor", async () => {
    fetchPageMock
      .mockResolvedValueOnce(
        page([], { nextCursor: "page-2", watermark: "wm-1" }),
      )
      .mockResolvedValueOnce(
        page([], { nextCursor: null, watermark: "wm-2" }),
      );
    const queued = await queueCommerceSync(context, "shopify", 1);

    expect(await processNextCommerceFetch(context)).toBe(true);
    expect(await processNextCommerceFetch(context)).toBe(false);

    const yielded = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(yielded).toMatchObject({
      status: "queued",
      fetchComplete: false,
      hasMore: true,
      pagesFetched: 1,
      continuationCursor: "page-2",
      candidateWatermark: "wm-1",
    });
    expect(yielded.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await finalizeCommerceRuns(context)).toBe(0);

    const beforeResume = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(beforeResume.config ?? "{}")).toMatchObject({
      watermark: "",
    });

    await rawDb.commerceSyncRun.update({
      where: { id: queued.id },
      data: { nextAttemptAt: new Date(0) },
    });
    expect(await processNextCommerceFetch(context)).toBe(true);
    expect(await finalizeCommerceRuns(context)).toBe(1);

    const completed = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      fetchComplete: true,
      hasMore: false,
      pagesFetched: 2,
      continuationCursor: null,
      candidateWatermark: "wm-2",
      activeKey: null,
    });
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integration.config ?? "{}")).toMatchObject({
      watermark: "wm-2",
    });
    expect(fetchPageMock).toHaveBeenCalledTimes(2);
  });

'''
write(commerce_test, content[:start] + replacement + content[end:])

print("Phase 3 commerce yield correction applied")
