import { describe, expect, it, vi } from "vitest";

import {
  loadWorkspaceStatus,
  workspaceStatusLines,
} from "@/lib/ai/chat/workspace-context";

function prismaWith(settings: Record<string, string>) {
  return {
    setting: {
      findMany: vi.fn().mockResolvedValue(
        Object.entries(settings).map(([key, value]) => ({ key, value })),
      ),
    },
    storefrontConfig: {
      count: vi.fn(({ where }: { where?: unknown } = {}) => Promise.resolve(where ? 1 : 2)),
    },
    automation: {
      count: vi.fn(({ where }: { where?: unknown } = {}) => Promise.resolve(where ? 3 : 4)),
    },
  };
}

describe("AI workspace setup awareness", () => {
  it("reports real setup state with booleans, counts and provider names only", async () => {
    const status = await loadWorkspaceStatus(
      prismaWith({
        profile_name: "Boutique Nour",
        business_wilaya: "Alger",
        gemini_consent_accepted: "true",
        daily_report_enabled: "false",
      }) as never,
      {
        whatsappStatus: async () => "qr",
        hasSecret: async (key) => key.startsWith("delivery_yalidine_"),
        license: async () => ({
          status: "valid",
          type: "trial",
          expiresAt: "2026-10-04T12:00:00.000Z",
        }),
        now: new Date("2026-10-01T12:00:00.000Z"),
      },
    );
    expect(status).toMatchObject({
      shopBasics: true,
      aiConsent: true,
      dailyReport: false,
      whatsapp: "qr",
      couriers: ["yalidine"],
      storefronts: { total: 2, active: 1 },
      automations: { total: 4, active: 3 },
      license: { status: "valid", type: "trial", daysLeft: 3 },
    });
    const text = workspaceStatusLines(status).join("\n");
    expect(text).toContain("WhatsApp connected no");
    expect(text).toContain("Couriers connected: yalidine.");
    expect(text).toContain("3 day(s) left");
    // Settings values themselves (shop name) never reach the model.
    expect(text).not.toContain("Boutique Nour");
  });

  it("drops a failed probe instead of guessing, and says what is missing", async () => {
    const status = await loadWorkspaceStatus(
      {
        setting: { findMany: vi.fn().mockRejectedValue(new Error("db")) },
        storefrontConfig: { count: vi.fn().mockRejectedValue(new Error("db")) },
        automation: { count: vi.fn().mockRejectedValue(new Error("db")) },
      } as never,
      {
        whatsappStatus: async () => "unavailable",
        hasSecret: async () => false,
        license: async () => {
          throw new Error("no authority");
        },
      },
    );
    expect(status.shopBasics).toBeNull();
    expect(status.storefronts).toBeNull();
    expect(status.license).toBeNull();
    expect(status.couriers).toEqual([]);
    const text = workspaceStatusLines(status).join("\n");
    expect(text).toContain("No courier is connected yet");
    expect(text).toContain("WhatsApp service: unavailable");
    expect(text).not.toContain("Storefronts");
    expect(text).not.toContain("Licence");
  });
});
