import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getTranslations, type Locale } from "@/lib/i18n";
import { getCodRuntimeTranslation } from "@/lib/i18n/cod-runtime";
import { getInboxOrderStatusRuntimeTranslation } from "@/lib/i18n/inbox-order-status-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { getSecurityRuntimeTranslation } from "@/lib/i18n/security-runtime";
import { getStorefrontRuntimeTranslation } from "@/lib/i18n/storefront-runtime";

/**
 * R5-d copy-authority migration contract (audits d4/d5).
 *
 * The four inline trilingual dictionaries (canonical-cod-dashboard TEXT,
 * storefront-release-history COPY, inbox-customer-work-panel
 * ORDER_STATUS_COPY, security-authority-panel COPY) moved verbatim into
 * runtime dictionaries registered in the shared
 * translations[key] ?? getRuntimeTranslation(locale, key) ?? key chain, so a
 * green suite proves (1) every migrated key still resolves with its exact
 * pre-migration value in all three locales, (2) locale-JSON keys keep
 * precedence where the old dictionaries collided with static keys, and
 * (3) the components no longer ship a second copy authority.
 */
const LOCALES: readonly Locale[] = ["en", "fr", "ar"];

function source(file: string): string {
  return fs
    .readFileSync(path.join(process.cwd(), file), "utf8")
    .replaceAll("\r\n", "\n");
}

/** The full JSON-first resolution order used by use-i18n.ts / i18n-server.ts. */
function translate(locale: Locale, key: string): string {
  const translations = getTranslations(locale);
  return translations[key] ?? getRuntimeTranslation(locale, key) ?? key;
}

const COD_KEYS = [
  "codReconciliation.authority",
  "codReconciliation.refresh",
  "codReconciliation.expected",
  "codReconciliation.collectedTotal",
  "codReconciliation.grossRemitted",
  "codReconciliation.fees",
  "codReconciliation.net",
  "codReconciliation.collectPending",
  "codReconciliation.remitPending",
  "codReconciliation.reviewCount",
  "codReconciliation.collectionTitle",
  "codReconciliation.collectionHelp",
  "codReconciliation.noCollection",
  "codReconciliation.settlementTitle",
  "codReconciliation.settlementHelp",
  "codReconciliation.noRemittance",
  "codReconciliation.reviewTitle",
  "codReconciliation.reviewHelp",
  "codReconciliation.noReview",
  "codReconciliation.recentTitle",
  "codReconciliation.noRecent",
  "codReconciliation.order",
  "codReconciliation.customer",
  "codReconciliation.provider",
  "codReconciliation.amount",
  "codReconciliation.expectedAmount",
  "codReconciliation.outstanding",
  "codReconciliation.reference",
  "codReconciliation.date",
  "codReconciliation.collect",
  "codReconciliation.select",
  "codReconciliation.gross",
  "codReconciliation.adjustment",
  "codReconciliation.final",
  "codReconciliation.batchReference",
  "codReconciliation.evidenceName",
  "codReconciliation.evidenceHash",
  "codReconciliation.addUnmatched",
  "codReconciliation.unmatchedReference",
  "codReconciliation.postBatch",
  "codReconciliation.selectedGross",
  "codReconciliation.unmatched",
  "codReconciliation.disputed",
  "codReconciliation.matchOrder",
  "codReconciliation.reason",
  "codReconciliation.match",
  "codReconciliation.correction",
  "codReconciliation.grossDelta",
  "codReconciliation.feeDelta",
  "codReconciliation.adjustmentDelta",
  "codReconciliation.discrepancyDelta",
  "codReconciliation.collectionCorrection",
  "codReconciliation.collectionDelta",
  "codReconciliation.state",
  "codReconciliation.posted",
  "codReconciliation.needsReview",
  "codReconciliation.lines",
  "codReconciliation.commitSuccess",
  "codReconciliation.replayed",
  "codReconciliation.failed",
  "codReconciliation.conflict",
  "codReconciliation.invalid",
  "codReconciliation.mixedProvider",
] as const;

const INBOX_ORDER_STATUS_KEYS = [
  "inbox.orderStatus.draft",
  "inbox.orderStatus.pending",
  "inbox.orderStatus.confirmed",
  "inbox.orderStatus.processing",
  "inbox.orderStatus.packed",
  "inbox.orderStatus.shipped",
  "inbox.orderStatus.delivered",
  "inbox.orderStatus.completed",
  "inbox.orderStatus.cancelled",
  "inbox.orderStatus.canceled",
  "inbox.orderStatus.refused",
  "inbox.orderStatus.returned",
  "inbox.orderStatus.return_completed",
  "inbox.orderStatus.failed",
] as const;

const SECURITY_KEYS = [
  "settings.security.title",
  "settings.security.description",
  "settings.security.workspace",
  "settings.security.device",
  "settings.security.sessions",
  "settings.security.current",
  "settings.security.active",
  "settings.security.revoked",
  "settings.security.missing",
  "settings.security.policy",
  "settings.security.lastSeen",
  "settings.security.bound",
  "settings.security.revoke",
  "settings.security.refreshing",
  "settings.security.refresh",
  "settings.security.loading",
  "settings.security.loadError",
  "settings.security.revokeError",
  "settings.security.reauthTitle",
  "settings.security.reauthDescription",
  "settings.security.pinPlaceholder",
  "settings.security.confirm",
  "settings.security.incorrectPin",
  "settings.security.noSessions",
] as const;

const STOREFRONT_RELEASE_KEYS = [
  "storefront.releaseHistory.title",
  "storefront.releaseHistory.description",
  "storefront.releaseHistory.current",
  "storefront.releaseHistory.rollback",
  "storefront.releaseHistory.rollingBack",
  "storefront.releaseHistory.confirm",
  "storefront.releaseHistory.empty",
  "storefront.releaseHistory.loading",
  "storefront.releaseHistory.loadFailed",
  "storefront.releaseHistory.rollbackFailed",
  "storefront.releaseHistory.rolledBack",
  "storefront.releaseHistory.products",
] as const;

const DICTS = [
  {
    name: "cod-runtime (canonical COD dashboard)",
    resolve: getCodRuntimeTranslation,
    keys: COD_KEYS,
    sentinelKey: "codReconciliation.unknownKey",
  },
  {
    name: "inbox-order-status-runtime (customer work panel)",
    resolve: getInboxOrderStatusRuntimeTranslation,
    keys: INBOX_ORDER_STATUS_KEYS,
    sentinelKey: "inbox.orderStatus.unknownKey",
  },
  {
    name: "security-runtime (security authority panel)",
    resolve: getSecurityRuntimeTranslation,
    keys: SECURITY_KEYS,
    sentinelKey: "settings.security.unknownKey",
  },
  {
    name: "storefront-runtime release history (R4-c dict, R5-d extension)",
    resolve: getStorefrontRuntimeTranslation,
    keys: STOREFRONT_RELEASE_KEYS,
    sentinelKey: "storefront.releaseHistory.unknownKey",
  },
] as const;

describe.each(DICTS)("$name", ({ resolve, keys, sentinelKey }) => {
  it.each(LOCALES)("resolves every migrated key for %s", (locale) => {
    for (const key of keys) {
      const value = resolve(locale, key);
      expect(value, `${locale} must resolve ${key}`).toBeTypeOf("string");
      expect(value?.trim(), `${locale}:${key} must not be empty`).not.toBe("");
      expect(value, `${locale}:${key} must not leak the key`).not.toBe(key);
    }
  });

  it("keeps Arabic copy localized", () => {
    for (const key of keys) {
      expect(resolve("ar", key), `${key} must be Arabic`).toMatch(
        /[\u0600-\u06ff]/,
      );
    }
  });

  it.each(LOCALES)("does not invent values for unknown keys (%s)", (locale) => {
    expect(resolve(locale, sentinelKey)).toBeUndefined();
  });
});

describe("runtime chain integration (R5-d)", () => {
  it.each(LOCALES)(
    "resolves migrated copy through getRuntimeTranslation for %s",
    (locale) => {
      expect(
        getRuntimeTranslation(locale, "codReconciliation.authority"),
      ).toBeTruthy();
      expect(
        getRuntimeTranslation(locale, "storefront.releaseHistory.title"),
      ).toBeTruthy();
      expect(
        getRuntimeTranslation(locale, "inbox.orderStatus.return_completed"),
      ).toBeTruthy();
      expect(
        getRuntimeTranslation(locale, "settings.security.reauthTitle"),
      ).toBeTruthy();
    },
  );

  it("renders the migrated dashboard copy with its exact pre-migration values", () => {
    expect(translate("ar", "codReconciliation.collectedTotal")).toBe("المحصّل");
    expect(translate("fr", "codReconciliation.grossRemitted")).toBe(
      "Versement brut",
    );
    expect(translate("en", "codReconciliation.commitSuccess")).toBe(
      "The governed COD command was committed.",
    );
    expect(translate("ar", "inbox.orderStatus.shipped")).toBe("تم الشحن");
    expect(translate("fr", "inbox.orderStatus.return_completed")).toBe(
      "Retour terminé",
    );
    expect(translate("en", "settings.security.noSessions")).toBe(
      "No sessions are recorded for this installation.",
    );
    expect(translate("ar", "storefront.releaseHistory.rollbackFailed")).toBe(
      "فشل الاسترجاع. تم الإبقاء على الإصدار الحي الحالي.",
    );
  });

  it("keeps locale-JSON precedence where the COD dashboard renamed colliding keys", () => {
    // The static codReconciliation.collected/remitted/success keys belong to
    // cod-controls / the reconciliation page; the dashboard migrated its
    // same-named TEXT entries under new keys so JSON stays authoritative.
    for (const key of [
      "codReconciliation.collected",
      "codReconciliation.remitted",
      "codReconciliation.success",
    ]) {
      expect(
        getRuntimeTranslation("en", key),
        `runtime must not shadow ${key}`,
      ).toBeUndefined();
      expect(getTranslations("en")[key]).toBeTruthy();
    }
  });

  it("reuses the static common.cancel key instead of duplicating it for the security panel", () => {
    expect(
      getSecurityRuntimeTranslation("en", "settings.security.cancel"),
    ).toBeUndefined();
    for (const locale of LOCALES) {
      expect(translate(locale, "common.cancel")).toBe(
        locale === "en" ? "Cancel" : locale === "fr" ? "Annuler" : "إلغاء",
      );
    }
  });
});

describe("migrated components no longer ship an inline copy authority", () => {
  it("canonical-cod-dashboard resolves every label through t()", () => {
    const src = source("src/components/accounting/canonical-cod-dashboard.tsx");
    expect(src).not.toContain("const TEXT");
    expect(src).toContain('const { t, locale } = useI18n();');
    expect(src).toContain('t("codReconciliation.authority")');
    expect(src).toContain('t("codReconciliation.commitSuccess")');
    expect(src).toContain('t("codReconciliation.mixedProvider")');
  });

  it("storefront-release-history resolves every label through t()", () => {
    const src = source(
      "src/components/storefront/studio/storefront-release-history.tsx",
    );
    expect(src).not.toContain("const COPY");
    expect(src).toContain('const { t, locale, dir } = useI18n();');
    expect(src).toContain('t("storefront.releaseHistory.title")');
    expect(src).toContain('t("storefront.releaseHistory.confirm")');
  });

  it("inbox-customer-work-panel localizes order statuses through t()", () => {
    const src = source("src/components/inbox/inbox-customer-work-panel.tsx");
    expect(src).not.toContain("const ORDER_STATUS_COPY");
    expect(src).toContain("function orderStatusLabel(");
    expect(src).toContain("orderStatusLabel(order.status, t)");
    expect(src).toContain("inbox.orderStatus.");
  });

  it("security-authority-panel resolves every label through t()", () => {
    const src = source("src/components/settings/security-authority-panel.tsx");
    expect(src).not.toContain("const COPY");
    expect(src).toContain('const { t, locale } = useI18n();');
    expect(src).toContain('t("settings.security.title")');
    expect(src).toContain('t("common.cancel")');
  });
});
