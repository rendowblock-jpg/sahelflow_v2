from pathlib import Path

ROOT = Path.cwd()
PATH = ROOT / "src/lib/integrations/ecommerce/processor.ts"
text = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    if text.count(old) != 1:
        raise SystemExit(f"expected one processor match: {old[:100]}")
    text = text.replace(old, new, 1)


replace_once(
    '''  attemptCount: number;
  leaseToken: string;
}

interface ClaimedItem {''',
    '''  attemptCount: number;
  operatorRetryCount: number;
  leaseToken: string;
}

interface ClaimedItem {''',
)
replace_once(
    '''  attemptCount: number;
  maxAttempts: number;
  leaseToken: string;
''',
    '''  attemptCount: number;
  maxAttempts: number;
  operatorRetryCount: number;
  leaseToken: string;
''',
)
replace_once(
    '''        leaseToken,
        state: "processing",
      },
    });
    return {
      id: candidate.id,
      platform: candidate.platform as EcommercePlatform,
''',
    '''        leaseToken,
        state: "processing",
        detailJson: JSON.stringify({
          cursor: candidate.continuationCursor,
          generation: candidate.operatorRetryCount,
        }),
      },
    });
    return {
      id: candidate.id,
      platform: candidate.platform as EcommercePlatform,
''',
)
replace_once(
    '''      pagesFetched: candidate.pagesFetched,
      attemptCount: attemptNumber,
      leaseToken,
''',
    '''      pagesFetched: candidate.pagesFetched,
      attemptCount: attemptNumber,
      operatorRetryCount: candidate.operatorRetryCount,
      leaseToken,
''',
)
replace_once(
    '''  const errorCode = safeCommerceErrorCode(error);
  const dead = run.attemptCount >= COMMERCE_FETCH_MAX_ATTEMPTS;
  await context.prisma.$transaction([
''',
    '''  const errorCode = safeCommerceErrorCode(error);
  const generationKey = JSON.stringify({
    cursor: run.continuationCursor,
    generation: run.operatorRetryCount,
  });
  const generationAttempts = await context.prisma.commerceSyncRunAttempt.count({
    where: {
      runId: run.id,
      phase: "fetch",
      detailJson: generationKey,
      state: { in: ["processing", "retrying", "failed"] },
    },
  });
  const dead = generationAttempts >= COMMERCE_FETCH_MAX_ATTEMPTS;
  await context.prisma.$transaction([
''',
)
replace_once(
    '''        state: dead ? "failed" : "retrying",
        errorCode,
        detailJson: JSON.stringify({ phase: "fetch" }),
        completedAt: now,
''',
    '''        state: dead ? "failed" : "retrying",
        errorCode,
        detailJson: generationKey,
        completedAt: now,
''',
)
replace_once(
    '''        nextAttemptAt: dead ? null : commerceRetryAt(run.attemptCount),
''',
    '''        nextAttemptAt: dead ? null : commerceRetryAt(generationAttempts),
''',
)
replace_once(
    '''        leaseToken,
        state: "processing",
      },
    });
    return {
      id: candidate.id,
      runId: candidate.runId,
''',
    '''        leaseToken,
        state: "processing",
        detailJson: JSON.stringify({ generation: candidate.operatorRetryCount }),
      },
    });
    return {
      id: candidate.id,
      runId: candidate.runId,
''',
)
replace_once(
    '''      attemptCount: attemptNumber,
      maxAttempts: candidate.maxAttempts,
      leaseToken,
''',
    '''      attemptCount: attemptNumber,
      maxAttempts: candidate.maxAttempts,
      operatorRetryCount: candidate.operatorRetryCount,
      leaseToken,
''',
)
replace_once(
    '''  const errorCode = safeCommerceErrorCode(error);
  const quarantine = quarantinesImmediately(error);
  const dead = !quarantine && item.attemptCount >= item.maxAttempts;
''',
    '''  const errorCode = safeCommerceErrorCode(error);
  const quarantine = quarantinesImmediately(error);
  const generationKey = JSON.stringify({ generation: item.operatorRetryCount });
  const generationAttempts = await context.prisma.commerceSyncItemAttempt.count({
    where: {
      itemId: item.id,
      detailJson: generationKey,
      state: { in: ["processing", "retrying", "dead_letter"] },
    },
  });
  const dead = !quarantine && generationAttempts >= item.maxAttempts;
''',
)
replace_once(
    '''        detailJson:
          error instanceof ValidationError && error.field
            ? JSON.stringify({ field: error.field })
            : null,
''',
    '''        detailJson:
          error instanceof ValidationError && error.field
            ? JSON.stringify({
                generation: item.operatorRetryCount,
                field: error.field,
              })
            : generationKey,
''',
)
replace_once(
    '''          status === "retrying" ? commerceRetryAt(item.attemptCount) : null,
''',
    '''          status === "retrying" ? commerceRetryAt(generationAttempts) : null,
''',
)

PATH.write_text(text, encoding="utf-8")
print("Task 6 commerce retry generations applied")
