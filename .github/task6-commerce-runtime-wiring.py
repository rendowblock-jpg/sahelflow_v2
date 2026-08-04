from pathlib import Path
import re

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one exact match in {path}: {old[:100]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/lib/integrations/ecommerce/sync-engine.ts",
    "async function upsertCanonicalCommerceOrder(\n",
    "export async function upsertCanonicalCommerceOrder(\n",
)

route_path = ROOT / "src/app/api/integrations/sync/route.ts"
route = route_path.read_text(encoding="utf-8")
route = route.replace(
    'import { syncPlatform, syncAllPlatforms } from "@/lib/integrations/ecommerce/sync-engine";\n',
    'import { queueCommerceSync, queueConfiguredCommerceSyncs } from "@/lib/integrations/ecommerce/queue";\n',
    1,
)
post_start = route.index("export const POST = withErrorHandler(")
get_comment = route.index("/**\n * GET /api/integrations/sync", post_start)
new_post = '''export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireAuth([
    "integrations.manage",
    "data.import",
    "orders.create",
    "customers.contact.read",
    "customers.contact.update",
    "orders.financials.read",
    "orders.financials.update",
  ]);

  const body = await req.json().catch(() => ({}));
  const input = syncSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  if (input.platform) {
    const run = await queueCommerceSync(
      context,
      input.platform as EcommercePlatform,
      input.maxPages,
    );
    return NextResponse.json({ runs: [run] }, { status: 202 });
  }

  const runs = await queueConfiguredCommerceSyncs(context, input.maxPages);
  if (runs.length === 0) {
    return NextResponse.json({
      runs: [],
      message: "No e-commerce platforms configured. Add credentials in Settings.",
    });
  }
  return NextResponse.json({ runs }, { status: 202 });
}, "POST /api/integrations/sync");

'''
route = route[:post_start] + new_post + route[get_comment:]
route = route.replace(
    '''  return NextResponse.json({ statuses });
}''',
    '''  const runs = await db.commerceSyncRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      platform: true,
      status: true,
      pagesFetched: true,
      fetchedCount: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      failedCount: true,
      lastErrorCode: true,
      nextAttemptAt: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ statuses, runs });
}''',
    1,
)
route_path.write_text(route, encoding="utf-8")

replace_once(
    "src/instrumentation.ts",
    '''    { startAutomationWorker },
    { startCourierOutboxWorker },
  ] = await Promise.all([
''',
    '''    { startAutomationWorker },
    { startCourierOutboxWorker },
    { startCommerceSyncWorker },
  ] = await Promise.all([
''',
)
replace_once(
    "src/instrumentation.ts",
    '''    import("./lib/automations/worker"),
    import("./lib/delivery/outbox-worker"),
  ]);
''',
    '''    import("./lib/automations/worker"),
    import("./lib/delivery/outbox-worker"),
    import("./lib/integrations/ecommerce/worker"),
  ]);
''',
)
replace_once(
    "src/instrumentation.ts",
    '''  startAutomationWorker();
  startCourierOutboxWorker();
}
''',
    '''  startAutomationWorker();
  startCourierOutboxWorker();
  startCommerceSyncWorker();
}
''',
)

api_helpers = ROOT / "src/app/api/__tests__/helpers.ts"
text = api_helpers.read_text(encoding="utf-8")
marker = '  await rawDb.$executeRawUnsafe(\'DELETE FROM "AutomationStepAttempt"\');\n'
commerce_cleanup = '''  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncItemAttempt"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncRunAttempt"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncItem"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncPage"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncRun"');
'''
if marker not in text:
    raise SystemExit("API helper commerce cleanup marker missing")
api_helpers.write_text(text.replace(marker, commerce_cleanup + marker, 1), encoding="utf-8")

data_helpers = ROOT / "src/lib/data/__tests__/helpers.ts"
text = data_helpers.read_text(encoding="utf-8")
marker = '  "ProviderCapabilityCertification",\n'
commerce_tables = '''  "CommerceSyncItemAttempt",
  "CommerceSyncRunAttempt",
  "CommerceSyncItem",
  "CommerceSyncPage",
  "CommerceSyncRun",
'''
if marker not in text:
    raise SystemExit("data helper commerce cleanup marker missing")
data_helpers.write_text(text.replace(marker, commerce_tables + marker, 1), encoding="utf-8")

print("Task 6 commerce runtime wiring applied")
