import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

describe("Algerian Founder demo contract", () => {
  it("never seeds credentials or live provider access", () => {
    const demo = read("src/lib/demo/algerian-demo.ts");

    expect(demo).toContain('ALGERIAN_DEMO_VERSION = "algerian-cod-founder-v1"');
    expect(demo).toContain('const DEMO_PREFIX = "demo-"');
    expect(demo).toContain("startsWith: DEMO_PREFIX");
    expect(demo).toContain(
      'const PROVIDERS = ["yalidine", "zrexpress", "maystro"]',
    );
    expect(demo).toContain("dryRun: true");
    expect(demo).toContain(
      'modelVersion: message.extractionMethod === "gemini" ? "gemini-3.5-flash"',
    );

    expect(demo).not.toContain("authSecret.create");
    expect(demo).not.toContain("secret.create");
    expect(demo).not.toContain("integration.create");
    expect(demo).not.toContain("provider credential");
    expect(demo).not.toMatch(/api[_-]?key\s*:/i);
  });

  it("contains one coherent past-tense Arabic/French COD story", () => {
    const demo = read("src/lib/demo/algerian-demo.ts");
    const story = read("src/lib/demo/algerian-demo-story.ts");
    const lifecycle = read("src/lib/demo/algerian-demo-lifecycle.ts");

    expect(demo).toContain("Fatima Zohra Benamar");
    expect(demo).toContain("سلام، شفت mini imprimante");
    expect(demo).toContain("تم تأكيد الطلب DZ-DEMO-0001");
    expect(demo).toContain("codCollected");
    expect(demo).toContain("codRemitted");
    expect(demo).toContain("client.return.create");
    expect(demo).toContain("client.refund.create");
    expect(demo).toContain("client.expense.createMany");
    expect(demo).toContain("client.conversation.create");
    expect(demo).toContain("client.storefrontConfig.create");

    expect(story).toContain('const FLAGSHIP_TOTAL = 6_350');
    expect(story).toContain('provider: "yalidine"');
    expect(story).toContain('codRemittanceRef: "REM-YAL-DEMO-001"');
    expect(story).toContain('remittanceRef: "REM-YAL-DEMO-001"');
    expect(story).toContain("daysBefore(new Date(), 6)");
    expect(story).toContain("createdAt: orderCreatedAt");
    expect(story).toContain(
      "await client.orderChange.deleteMany({ where: { orderId: FLAGSHIP_ORDER_ID } })",
    );
    expect(story).toContain('status: "delivered"');
    expect(lifecycle).toContain("await finalizeAlgerianDemoStory(tx)");
  });

  it("uses an authenticated atomic and recoverable lifecycle", () => {
    const route = read("src/app/api/demo-data/route.ts");
    const lifecycle = read("src/lib/demo/algerian-demo-lifecycle.ts");
    const policy = read("src/lib/demo/algerian-demo-policy.ts");
    const settingsService = read("src/lib/settings/index.ts");
    const panel = read("src/components/settings/demo-data-panel.tsx");
    const settings = read("src/components/settings/settings-tabs.tsx");

    expect(route.match(/await requireAuth\(\)/g)).toHaveLength(3);
    expect(route).toContain("getAlgerianDemoWorkspaceStatus");
    expect(route).toContain("loadAlgerianDemoWorkspace");
    expect(route).toContain("removeAlgerianDemoWorkspace");
    expect(route).toContain('"Cache-Control": "no-store"');

    expect(lifecycle.match(/client\.\$transaction/g)).toHaveLength(2);
    expect(
      (lifecycle.match(/withDemoPolicyLock/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(lifecycle).toContain("timeout: 120_000");
    expect(lifecycle).toContain("countNonDemoSellerState");
    expect(lifecycle).toContain("countEffectfulSettings");
    expect(lifecycle).toContain("countLegacyPhoneReputation");
    expect(lifecycle).toContain("countIndependentExtractionMetrics");
    expect(lifecycle).toContain(
      'LEGACY_PHONE_REPUTATION_KEY = "phone_reputation_blacklist"',
    );
    expect(lifecycle).toContain("dailyReportWouldBeEffectful(settings)");
    expect(lifecycle).toContain("client.phoneReputation.count()");
    expect(lifecycle).toContain("demoMessageDerivedCount");
    expect(lifecycle).toContain("client.counter.count()");
    expect(lifecycle).toContain("client.storefrontConfig.count");
    expect(lifecycle).toContain("client.automation.count");
    expect(lifecycle).toContain("client.cannedResponse.count");
    expect(lifecycle).toContain("client.whatsAppTemplate.count");
    expect(lifecycle).toContain("client.integration.count");
    expect(lifecycle).toContain('"DEMO_SHOP_NOT_EMPTY"');
    expect(lifecycle).toContain('"DEMO_REMOVAL_REAL_DATA_PRESENT"');
    expect(lifecycle).toContain("messageId: demoIdentity");
    expect(lifecycle).toContain("entityId: demoIdentity");

    expect(policy).toContain('ALGERIAN_DEMO_MARKER_KEY = "demo_seed_version"');
    expect(policy).toContain("let demoPolicyTail: Promise<void>");
    expect(policy).toContain("export async function withDemoPolicyLock");
    expect(policy).toContain("dailyReportWouldBeEffectful");
    expect(policy).toContain("assertDemoAllowsDailyReportSettings");
    expect(policy).toContain('"DEMO_REPORT_CONFIGURATION_BLOCKED"');

    expect(settingsService).toContain("const RESERVED_SETTING_KEYS = new Set([");
    expect(settingsService).toContain('"demo_seed_version"');
    expect(settingsService).toContain('"demo_seed_created_at"');
    expect(settingsService).toContain("RESERVED_SETTING_KEYS.has(key)");

    expect(panel).toContain('const COPY: Record<"ar" | "fr" | "en", Copy>');
    expect(panel).toContain('fetch("/api/demo-data"');
    expect(panel).toContain('mutate("DELETE")');
    expect(panel).toContain("window.confirm(copy.confirmRemove)");
    expect(panel).toContain("Fatima Zohra WhatsApp message");
    expect(panel).toContain("رسالة واتساب من فاطمة الزهراء");

    expect(settings).toContain('{ id: "demo", icon: Database');
    expect(settings).toContain('useState<Tab>("demo")');
    expect(settings).toContain("<DemoDataPanel />");
  });

  it("serializes settings, reset and report effects with demo lifecycle authority", () => {
    const settingsRoute = read("src/app/api/settings/route.ts");
    const resetRoute = read("src/app/api/settings/reset/route.ts");
    const reportRoute = read("src/app/api/reports/daily/route.ts");

    expect(settingsRoute).toContain("await withDemoPolicyLock(() =>");
    expect(settingsRoute).toContain("db.$transaction(async (transaction) =>");
    expect(settingsRoute).toContain(
      "await assertDemoAllowsDailyReportSettings(prisma, effectiveAfter)",
    );
    expect(
      settingsRoute.indexOf("assertDemoAllowsDailyReportSettings"),
    ).toBeLessThan(
      settingsRoute.indexOf("await setSetting(context, key, value)"),
    );

    expect(reportRoute).toContain(
      "return withDemoPolicyLock(() => executeReport(trigger))",
    );
    expect(reportRoute).toContain("if (await isAlgerianDemoLoaded(db))");
    expect(reportRoute).toContain('code: "DEMO_REPORT_SEND_BLOCKED"');
    expect(reportRoute.indexOf("isAlgerianDemoLoaded(db)")).toBeLessThan(
      reportRoute.indexOf("sidecar.send(phone, report.message)"),
    );

    expect(resetRoute).toContain("await withDemoPolicyLock(() =>");
    expect(resetRoute).toContain("await tx.returnNote.deleteMany({})");
    expect(resetRoute).toContain("await tx.whatsAppTemplate.deleteMany({})");
    expect(resetRoute).toContain("await tx.storefrontConfig.deleteMany({})");
    expect(resetRoute).toContain("await tx.phoneReputation.deleteMany({})");
    expect(resetRoute).toContain("await tx.counter.deleteMany({})");
    expect(resetRoute.indexOf("storefrontConfig.deleteMany")).toBeLessThan(
      resetRoute.indexOf("product.deleteMany"),
    );
  });

  it("persists compiled startup modules and streams an authentic dashboard shell", () => {
    const helper = read("src/lib/runtime/compile-cache.ts");
    const readiness = read("src/app/api/internal/runtime-ready/route.ts");
    const uiReady = read("src/app/api/internal/runtime-ui-ready/route.ts");
    const dashboardLoading = read(
      "src/app/(dashboard)/dashboard/loading.tsx",
    );

    expect(helper).toContain('getBuiltinModule?.(\n      "node:module"');
    expect(helper).toContain("moduleApi.flushCompileCache()");
    expect(readiness).toContain("flushPackagedCompileCache();");
    expect(uiReady).toContain("flushPackagedCompileCache();");
    expect(dashboardLoading).toContain('className="app-content page-sections"');
    expect(dashboardLoading).toContain('aria-busy="true"');
    expect(dashboardLoading).not.toContain("FullPageSkeleton");
  });
});
