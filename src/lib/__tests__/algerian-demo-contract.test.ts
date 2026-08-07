import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Algerian Founder demo contract", () => {
  it("uses an authenticated atomic and recoverable lifecycle", () => {
    const lifecycle = read("src/lib/demo-data/lifecycle.ts");
    const policy = read("src/lib/demo-data/policy.ts");
    const settingsService = read("src/lib/data/settings-service.ts");
    const panel = read("src/components/settings/demo-data-panel.tsx");
    const settings = read("src/components/settings/settings-tabs.tsx");

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
    expect(settings).toContain("TABS.filter((tab) => access[tab.id])");
    expect(settings).toContain("visibleTabs[0]?.id");
    expect(settings).toContain("<DemoDataPanel />");
  });

  it("serializes settings, erase and report effects with demo lifecycle authority", () => {
    const settingsRoute = read("src/app/api/settings/route.ts");
    const resetRoute = read("src/app/api/settings/reset/route.ts");
    const privacyLifecycle = read("src/lib/privacy/lifecycle.ts");
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
    expect(resetRoute).toContain("withDemoPolicyLock");
    expect(privacyLifecycle).toContain("withDemoPolicyLock");
  });
});
