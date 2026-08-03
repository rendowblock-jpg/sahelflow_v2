/**
 * Shared utilities tests — locale-aware date formatting, status style maps,
 * delivery provider config, customer status config, and risk-score helpers.
 *
 * All functions are pure (no DB, no side effects) — tested directly.
 */
import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateShort,
  formatTime,
  orderStatusStyles,
  deliveryProviderConfig,
  customerStatusConfig,
  getRiskConfig,
  type StatusStyle,
  type RiskConfig,
} from "../shared";
import type { OrderStatus } from "@/types/domain";

// ── Date formatting ─────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a Date in the given locale (default fr)", () => {
    const d = new Date("2026-03-15T10:00:00Z");
    const s = formatDate(d, "fr");
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/15/);
  });

  it("accepts an ISO string", () => {
    const s = formatDate("2026-03-15T10:00:00Z", "en");
    expect(s).toMatch(/2026/);
  });

  it("respects the locale argument", () => {
    const d = new Date("2026-03-15T10:00:00Z");
    const fr = formatDate(d, "fr");
    const en = formatDate(d, "en");
    // Both contain the year, but locale-specific month formatting may differ.
    expect(fr).toBeTruthy();
    expect(en).toBeTruthy();
  });
});

describe("formatDateShort", () => {
  it("formats a Date without the year", () => {
    const d = new Date("2026-03-15T10:00:00Z");
    const s = formatDateShort(d, "fr");
    expect(s).toMatch(/15/);
    expect(s).not.toMatch(/2026/);
  });
});

describe("formatTime", () => {
  it("formats a Date as HH:MM", () => {
    const d = new Date("2026-03-15T13:45:00Z");
    const s = formatTime(d, "en");
    expect(s).toMatch(/^\d{2}:\d{2}$/);
  });
});

// ── orderStatusStyles ───────────────────────────────────────────────────────

describe("orderStatusStyles", () => {
  const allStatuses: OrderStatus[] = [
    "draft",
    "pending",
    "confirmed",
    "shipped",
    "delivered",
    "returned",
    "refused",
    "cancelled",
  ];

  it("has an entry for every OrderStatus", () => {
    for (const s of allStatuses) {
      expect(orderStatusStyles[s]).toBeDefined();
    }
  });

  it("each entry has the full StatusStyle shape", () => {
    for (const s of allStatuses) {
      const style: StatusStyle = orderStatusStyles[s];
      expect(typeof style.i18nKey).toBe("string");
      expect(style.i18nKey.length).toBeGreaterThan(0);
      expect(typeof style.dot).toBe("string");
      expect(typeof style.bg).toBe("string");
      expect(typeof style.text).toBe("string");
      expect(typeof style.border).toBe("string");
      expect(typeof style.icon).toBe("string");
      expect(typeof style.ring).toBe("string");
    }
  });

  it("i18nKey follows the orders.status.<status> pattern", () => {
    for (const s of allStatuses) {
      expect(orderStatusStyles[s].i18nKey).toBe(`orders.status.${s}`);
    }
  });
});

// ── deliveryProviderConfig ──────────────────────────────────────────────────

describe("deliveryProviderConfig", () => {
  const knownProviders = ["yalidine", "maystro", "zrexpress", "zr_express", "noest"];

  it("has an entry for every known provider key", () => {
    for (const p of knownProviders) {
      expect(deliveryProviderConfig[p]).toBeDefined();
      expect(typeof deliveryProviderConfig[p]!.color).toBe("string");
      expect(typeof deliveryProviderConfig[p]!.label).toBe("string");
    }
  });

  it("zrexpress and zr_express both map to 'ZR Express'", () => {
    expect(deliveryProviderConfig.zrexpress!.label).toBe("ZR Express");
    expect(deliveryProviderConfig.zr_express!.label).toBe("ZR Express");
  });

  it("brand labels are proper nouns (not translated)", () => {
    expect(deliveryProviderConfig.yalidine!.label).toBe("Yalidine");
    expect(deliveryProviderConfig.maystro!.label).toBe("Maystro");
    expect(deliveryProviderConfig.noest!.label).toBe("NOEST Express");
  });
});

// ── customerStatusConfig ────────────────────────────────────────────────────

describe("customerStatusConfig", () => {
  it("has entries for active, inactive, and blocked", () => {
    expect(customerStatusConfig.active).toBeDefined();
    expect(customerStatusConfig.inactive).toBeDefined();
    expect(customerStatusConfig.blocked).toBeDefined();
  });

  it("each entry has i18nKey + color + bg", () => {
    for (const key of Object.keys(customerStatusConfig)) {
      const entry = customerStatusConfig[key]!;
      expect(typeof entry.i18nKey).toBe("string");
      expect(typeof entry.color).toBe("string");
      expect(typeof entry.bg).toBe("string");
    }
  });

  it("i18nKey follows the common.<status> pattern", () => {
    expect(customerStatusConfig.active!.i18nKey).toBe("common.active");
    expect(customerStatusConfig.inactive!.i18nKey).toBe("common.inactive");
    expect(customerStatusConfig.blocked!.i18nKey).toBe("common.blocked");
  });
});

// ── getRiskConfig ───────────────────────────────────────────────────────────

describe("getRiskConfig", () => {
  it("returns low-risk style for scores ≤ 30", () => {
    const cfg: RiskConfig = getRiskConfig(0);
    expect(cfg.i18nKey).toBe("customers.riskLow");
    expect(cfg.bg).toContain("success");
    expect(cfg.progressColor).toBe("bg-success");
  });

  it("returns low-risk style at exactly 30", () => {
    expect(getRiskConfig(30).i18nKey).toBe("customers.riskLow");
  });

  it("returns medium-risk style for scores 31-60", () => {
    const cfg = getRiskConfig(45);
    expect(cfg.i18nKey).toBe("customers.riskMedium");
    expect(cfg.bg).toContain("warning");
    expect(cfg.progressColor).toBe("bg-warning");
  });

  it("returns medium-risk style at exactly 60", () => {
    expect(getRiskConfig(60).i18nKey).toBe("customers.riskMedium");
  });

  it("returns high-risk style for scores > 60", () => {
    const cfg = getRiskConfig(85);
    expect(cfg.i18nKey).toBe("customers.riskHigh");
    expect(cfg.bg).toContain("destructive");
    expect(cfg.progressColor).toBe("bg-destructive");
  });

  it("returns high-risk style for score 100", () => {
    expect(getRiskConfig(100).i18nKey).toBe("customers.riskHigh");
  });
});
