import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

describe("Algerian Founder demo contract", () => {
  it("loads only into an empty shop and never seeds credentials or live provider access", () => {
    const demo = read("src/lib/demo/algerian-demo.ts");

    expect(demo).toContain('ALGERIAN_DEMO_VERSION = "algerian-cod-founder-v1"');
    expect(demo).toContain('"DEMO_SHOP_NOT_EMPTY"');
    expect(demo).toContain("if (initial.hasBusinessData)");
    expect(demo).toContain('const DEMO_PREFIX = "demo-"');
    expect(demo).toContain("startsWith: DEMO_PREFIX");
    expect(demo).toContain('const PROVIDERS = ["yalidine", "zrexpress", "maystro"]');
    expect(demo).toContain('dryRun: true');
    expect(demo).toContain('modelVersion: message.extractionMethod === "gemini" ? "gemini-3.5-flash"');

    expect(demo).not.toContain("authSecret.create");
    expect(demo).not.toContain("secret.create");
    expect(demo).not.toContain("integration.create");
    expect(demo).not.toContain("provider credential");
    expect(demo).not.toMatch(/api[_-]?key\s*:/i);
  });

  it("contains a coherent Arabic/French COD story and broad operational depth", () => {
    const demo = read("src/lib/demo/algerian-demo.ts");
    const story = read("src/lib/demo/algerian-demo-story.ts");
    const route = read("src/app/api/demo-data/route.ts");

    expect(demo).toContain("Fatima Zohra Benamar");
    expect(demo).toContain("سلام، شفت mini imprimante");
    expect(demo).toContain("تم تأكيد الطلب DZ-DEMO-0001");
    expect(demo).toContain("codCollected");
    expect(demo).toContain("codRemitted");
    expect(demo).toContain("codRemittanceRef");
    expect(demo).toContain("client.return.create");
    expect(demo).toContain("client.refund.create");
    expect(demo).toContain("client.expense.createMany");
    expect(demo).toContain("client.conversation.create");
    expect(demo).toContain("client.orderChange.create");
    expect(demo).toContain("client.storefrontConfig.create");

    expect(story).toContain('const FLAGSHIP_TOTAL = 6_350');
    expect(story).toContain('provider: "yalidine"');
    expect(story).toContain('codRemittanceRef: "REM-YAL-DEMO-001"');
    expect(story).toContain('status: "delivered"');
    expect(route).toContain("await finalizeAlgerianDemoStory();");
  });

  it("exposes authenticated UI controls and blocks unsafe cleanup", () => {
    const route = read("src/app/api/demo-data/route.ts");
    const panel = read("src/components/settings/demo-data-panel.tsx");
    const settings = read("src/components/settings/settings-tabs.tsx");

    expect(route.match(/await requireAuth\(\)/g)).toHaveLength(3);
    expect(route).toContain('"DEMO_REMOVAL_REAL_DATA_PRESENT"');
    expect(route).toContain("countNonDemoOperationalRecords");
    expect(route).toContain('headers: { "Cache-Control": "no-store" }');

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
