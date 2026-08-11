import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Settings operational workspace contract", () => {
  it("routes Settings through four task-shaped groups instead of the legacy tab router", () => {
    const page = read("src/app/(dashboard)/settings/page.tsx");
    const workspace = read("src/components/settings/settings-workspace.tsx");
    expect(page).toContain("SettingsWorkspace");
    expect(page).not.toContain("SettingsTabs");
    expect(workspace).toContain('data-settings-workspace="v2"');
    expect(workspace).toContain('{ id: "experience"');
    expect(workspace).toContain('id: "connections"');
    expect(workspace).toContain('id: "team"');
    expect(workspace).toContain('id: "data"');
    expect(workspace).toContain("AppearancePanel");
    expect(workspace).toContain("SecurityAuthorityPanel");
    expect(workspace).toContain("LicensePanel");
  });

  it("keeps commerce status separate from delivery, WhatsApp and Gemini authority", () => {
    const commerce = read(
      "src/components/settings/commerce-integrations-panel.tsx",
    );
    expect(commerce).toContain('id: "youcan"');
    expect(commerce).toContain('id: "shopify"');
    expect(commerce).toContain('id: "woocommerce"');
    expect(commerce).not.toContain("Yalidine");
    expect(commerce).not.toContain("Maystro");
    expect(commerce).not.toContain("WhatsApp");
    expect(commerce).not.toContain("Gemini");
    expect(commerce).not.toContain("window.location.reload");
  });

  it("keeps manual daily-report execution authenticated and cron authority server-only", () => {
    const route = read("src/app/api/reports/daily/route.ts");
    const panel = read("src/components/settings/daily-report-panel.tsx");
    expect(route).toContain('searchParams.get("trigger") === "manual"');
    expect(route).toContain('await requireAuth("settings.manage")');
    expect(route).toContain("verifyCronSecret");
    expect(route).toContain("env.cronSecret");
    expect(panel).toContain("/api/reports/daily?trigger=manual");
    expect(panel).not.toContain("publicCronSecret");
    expect(panel).not.toContain("NEXT_PUBLIC_CRON_SECRET");
  });

  it("does not turn unavailable authority into missing credentials or empty history", () => {
    const ai = read("src/components/settings/ai-key-panel.tsx");
    const delivery = read(
      "src/components/settings/delivery-credentials-panel.tsx",
    );
    const backup = read("src/components/settings/backup-restore-panel.tsx");
    const commerceRecovery = read(
      "src/components/settings/commerce-sync-recovery-panel.tsx",
    );
    const phone = read("src/components/settings/phone-reputation-panel.tsx");

    expect(ai).toContain('"verification-required"');
    expect(ai).toContain('"unavailable"');
    expect(ai).toContain("REAUTHENTICATION_REQUIRED");
    expect(delivery).toContain('"verification-required"');
    expect(delivery).toContain('"unavailable"');
    expect(delivery).toContain("REAUTHENTICATION_REQUIRED");
    expect(backup).toContain("loadError");
    expect(backup.indexOf("loadError ?")).toBeLessThan(
      backup.indexOf("backups.length === 0 ?"),
    );
    expect(commerceRecovery).toContain(
      'type LoadState = "loading" | "ready" | "error"',
    );
    expect(phone).toContain(
      'type LoadState = "loading" | "ready" | "error"',
    );
  });

  it("keeps read and mutation permissions distinct where the APIs do", () => {
    const page = read("src/app/(dashboard)/settings/page.tsx");
    const phone = read("src/components/settings/phone-reputation-panel.tsx");
    expect(page).toContain('delivery: can("delivery.credentials.manage")');
    expect(page).toContain('phone: can("risk.read")');
    expect(page).toContain('phoneManage: can("risk.manage")');
    expect(phone).toContain("canManage");
  });

  it("preserves the generic settings service as non-secret reserved-key authority", () => {
    const route = read("src/app/api/settings/route.ts");
    const service = read("src/lib/settings/index.ts");
    expect(route).toContain('requireAuth("settings.read")');
    expect(route).toContain('requireAuth("settings.manage")');
    expect(route).toContain("getAllSettings");
    expect(route).toContain("setSetting");
    expect(service).toContain("RESERVED_SETTING_KEY_PREFIXES");
    expect(service).toContain("SETTING_RESERVED_KEY");
    expect(service).toContain("For secret values");
  });

  it("keeps destructive reset on its dedicated reauth and lifecycle authority", () => {
    const reset = read("src/app/api/settings/reset/route.ts");
    expect(reset).toContain('requireAuth("settings.destructive")');
    expect(reset).toContain("requireRecentReauthentication");
    expect(reset).toContain("createDestructiveApproval");
    expect(reset).toContain("eraseCurrentShopLifecycle");
  });

  it("centralizes new Settings workspace copy in AR, FR and EN", () => {
    const copy = read("src/lib/i18n/settings-workspace.ts");
    expect(copy).toContain("en:");
    expect(copy).toContain("fr:");
    expect(copy).toContain("ar:");
    expect(copy).toContain("Experience & operations");
    expect(copy).toContain("Expérience et opérations");
    expect(copy).toContain("التجربة والعمليات");
  });
});
