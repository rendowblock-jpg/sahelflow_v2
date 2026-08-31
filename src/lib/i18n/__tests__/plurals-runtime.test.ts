import { describe, expect, it } from "vitest";

import {
  getTranslations,
  interpolateTranslation,
  type Locale,
} from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { getPluralsRuntimeTranslation } from "@/lib/i18n/plurals-runtime";

/**
 * R5-a plural-agreement contract (audit d6 #5).
 *
 * The resolver under test replicates use-i18n.ts / i18n-server.ts exactly:
 *
 *   value = translations[key] ?? getRuntimeTranslation(locale, key) ?? key
 *   pluralKey = `${key}_${Intl.PluralRules(locale).select(count)}`
 *   value = translations[pluralKey] ?? getRuntimeTranslation(locale, pluralKey) ?? value
 *
 * so a green suite proves the runtime plural keys win for the categories they
 * define while locale-JSON plural keys (PR #355-owned) keep precedence.
 */
function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const translations = getTranslations(locale);
  let value = translations[key] ?? getRuntimeTranslation(locale, key) ?? key;
  if (params && "count" in params) {
    const pluralRule = new Intl.PluralRules(locale).select(
      Number(params.count),
    );
    const pluralKey = `${key}_${pluralRule}`;
    value =
      translations[pluralKey] ??
      getRuntimeTranslation(locale, pluralKey) ??
      value;
  }
  return interpolateTranslation(value, params);
}

const AR_CATEGORIES = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
] as const;

/** Representative counts — at least one per Arabic plural category. */
const AR_COUNTS = [0, 1, 2, 3, 5, 10, 11, 26, 99, 100, 101, 111, 1_000];

/** Keys with a full six-form Arabic set in plurals-runtime. */
const FULL_AR_KEYS = [
  "confirmationQueue.header.pendingCount",
  "confirmationQueue.bulk.rejectTitle",
  "orders.bulkSuccess",
  "topbar.newNotifications",
  "dataTable.selected",
  "dataTable.pageOf",
  "dashboard.pendingDeliveries",
  "inbox.liveness.unreadMessages",
  "inbox.labels.count",
  "storefront.view.cart",
  "storefront.studio.stockCount",
  "storefront.list.productsCount",
  "storefront.builder.selectedCount",
  "products.inStockCount",
  "products.lowStockCount",
  "import.importRows",
  "import.success",
  "import.errorCount",
  "import.invalidLines",
] as const;

/** notif.staleQueue.title: ar.json owns _one/_other; runtime fills the rest. */
const STALE_QUEUE_RUNTIME_CATEGORIES = [
  "zero",
  "two",
  "few",
  "many",
] as const;

describe("plurals-runtime dictionary — Arabic completeness", () => {
  it("defines all six Arabic plural categories for every full-coverage key", () => {
    for (const key of FULL_AR_KEYS) {
      for (const category of AR_CATEGORIES) {
        const entry = getPluralsRuntimeTranslation("ar", `${key}_${category}`);
        expect(entry, `${key}_${category}`).toBeTruthy();
        expect(entry, `${key}_${category}`).toMatch(/[\u0600-\u06ff]/);
      }
    }
  });

  it("fills only the notif.staleQueue.title categories the locale JSON lacks", () => {
    for (const category of STALE_QUEUE_RUNTIME_CATEGORIES) {
      expect(
        getPluralsRuntimeTranslation("ar", `notif.staleQueue.title_${category}`),
      ).toBeTruthy();
    }
    // ar.json owns these two — the runtime must NOT shadow them.
    expect(
      getPluralsRuntimeTranslation("ar", "notif.staleQueue.title_one"),
    ).toBeUndefined();
    expect(
      getPluralsRuntimeTranslation("ar", "notif.staleQueue.title_other"),
    ).toBeUndefined();
  });

  it("resolves every representative Arabic count without leaking placeholders", () => {
    for (const key of FULL_AR_KEYS) {
      for (const count of AR_COUNTS) {
        // dataTable.pageOf always renders with the current/total page params.
        const params: Record<string, string | number> =
          key === "dataTable.pageOf"
            ? { count, current: 2, total: 7 }
            : { count };
        const result = translate("ar", key, params);
        expect(result, `${key} × ${count}`).not.toContain("{{");
        expect(result, `${key} × ${count}`).not.toContain("{c");
        expect(result, `${key} × ${count}`).not.toBe(key);
      }
    }
  });

  it("keeps extra params (pagination) through every Arabic plural form", () => {
    for (const count of AR_COUNTS) {
      const result = translate("ar", "dataTable.pageOf", {
        count,
        current: 2,
        total: 7,
      });
      expect(result).toContain("2");
      expect(result).toContain("7");
      expect(result).not.toContain("{{");
    }
  });
});

describe("plurals-runtime dictionary — Arabic agreement samples", () => {
  it("uses real Arabic plural agreement for the confirmation queue badge", () => {
    expect(translate("ar", "confirmationQueue.header.pendingCount", { count: 0 })).toBe(
      "لا طلبيات قيد الانتظار",
    );
    expect(translate("ar", "confirmationQueue.header.pendingCount", { count: 1 })).toBe(
      "طلبية واحدة قيد الانتظار",
    );
    expect(translate("ar", "confirmationQueue.header.pendingCount", { count: 2 })).toBe(
      "طلبيتان قيد الانتظار",
    );
    expect(translate("ar", "confirmationQueue.header.pendingCount", { count: 5 })).toBe(
      "5 طلبيات قيد الانتظار",
    );
    expect(translate("ar", "confirmationQueue.header.pendingCount", { count: 11 })).toBe(
      "11 طلبية قيد الانتظار",
    );
    expect(
      translate("ar", "confirmationQueue.header.pendingCount", { count: 100 }),
    ).toBe("100 طلبية قيد الانتظار");
  });

  it("agrees the bulk success toast that migrated from {{n}} to {count}", () => {
    expect(translate("ar", "orders.bulkSuccess", { count: 1 })).toBe(
      "تم تحديث طلبية واحدة بنجاح",
    );
    expect(translate("ar", "orders.bulkSuccess", { count: 2 })).toBe(
      "تم تحديث طلبيتين بنجاح",
    );
    expect(translate("ar", "orders.bulkSuccess", { count: 5 })).toBe(
      "تم تحديث 5 طلبيات بنجاح",
    );
    expect(translate("ar", "orders.bulkSuccess", { count: 11 })).toBe(
      "تم تحديث 11 طلبية بنجاح",
    );
  });

  it("agrees the sidebar unread badge and table selection counts", () => {
    expect(translate("ar", "inbox.liveness.unreadMessages", { count: 1 })).toBe(
      "رسالة واحدة غير مقروءة",
    );
    expect(translate("ar", "inbox.liveness.unreadMessages", { count: 2 })).toBe(
      "رسالتان غير مقروءتان",
    );
    expect(translate("ar", "dataTable.selected", { count: 1 })).toBe(
      "عنصر واحد محدد",
    );
    expect(translate("ar", "dataTable.selected", { count: 2 })).toBe(
      "عنصران محددان",
    );
    expect(translate("ar", "dataTable.selected", { count: 11 })).toBe(
      "11 عنصرًا محددًا",
    );
  });
});

describe("plurals-runtime dictionary — en/fr singular correction", () => {
  it("fixes French singular agreement", () => {
    expect(translate("fr", "dataTable.selected", { count: 1 })).toBe(
      "1 sélectionné",
    );
    expect(translate("fr", "dataTable.selected", { count: 2 })).toBe(
      "2 sélectionnés",
    );
    expect(translate("fr", "orders.bulkSuccess", { count: 1 })).toBe(
      "1 commande mise à jour",
    );
    expect(translate("fr", "confirmationQueue.bulk.rejectTitle", { count: 1 })).toBe(
      "Refuser 1 commande",
    );
  });

  it("fixes English singular agreement", () => {
    expect(translate("en", "dataTable.pageOf", { count: 1, current: 2, total: 3 })).toBe(
      "Page 2 of 3 (1 item)",
    );
    expect(translate("en", "orders.bulkSuccess", { count: 1 })).toBe(
      "1 order updated successfully",
    );
    expect(translate("en", "import.success", { count: 1 })).toBe(
      "1 item imported successfully",
    );
    expect(translate("en", "inbox.labels.count", { count: 1 })).toBe("1 label");
  });

  it("never leaks the legacy {{n}} placeholder on migrated keys (en/fr incl. fr many)", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const count of [0, 1, 2, 5, 11, 100, 1_000_000]) {
        expect(
          translate(locale, "orders.bulkSuccess", { count }),
          `${locale} × ${count}`,
        ).not.toContain("{{");
        expect(
          translate(locale, "topbar.newNotifications", { count }),
          `${locale} × ${count}`,
        ).not.toContain("{{");
      }
    }
  });

  it("returns undefined for keys it does not own", () => {
    expect(getPluralsRuntimeTranslation("en", "not.a.key")).toBeUndefined();
    expect(getPluralsRuntimeTranslation("ar", "orders.count_one")).toBeUndefined();
  });
});

describe("plurals-runtime dictionary — precedence against the locale JSON", () => {
  it("lets ar.json keep owning notif.staleQueue.title_one and _other", () => {
    // count=1 → JSON "notif.staleQueue.title_one" wins (runtime has none).
    expect(translate("ar", "notif.staleQueue.title", { count: 1 })).toBe(
      "طلب واحد يحتاج إلى تأكيد",
    );
    // count=100 → JSON "notif.staleQueue.title_other" wins.
    expect(translate("ar", "notif.staleQueue.title", { count: 100 })).toBe(
      "100 طلبات تحتاج إلى تأكيد",
    );
  });

  it("fills the Arabic two/few/many gap the locale JSON leaves open", () => {
    expect(translate("ar", "notif.staleQueue.title", { count: 2 })).toBe(
      "طلبان يحتاجان إلى تأكيد",
    );
    expect(translate("ar", "notif.staleQueue.title", { count: 5 })).toBe(
      "5 طلبات تحتاج إلى تأكيد",
    );
    expect(translate("ar", "notif.staleQueue.title", { count: 11 })).toBe(
      "11 طلبًا يحتاج إلى تأكيد",
    );
  });

  it("leaves the complete orders.count plural set in ar.json untouched", () => {
    expect(translate("ar", "orders.count", { count: 1 })).toBe("طلب واحد");
    expect(translate("ar", "orders.count", { count: 2 })).toBe("طلبان");
    expect(translate("ar", "orders.count", { count: 5 })).toBe("5 طلبات");
    expect(translate("ar", "orders.count", { count: 11 })).toBe("11 طلبًا");
  });

  it("is reachable through the shared runtime chain (getRuntimeTranslation)", () => {
    expect(
      getRuntimeTranslation("ar", "confirmationQueue.header.pendingCount_two"),
    ).toBe("طلبيتان قيد الانتظار");
    expect(
      getRuntimeTranslation("fr", "dataTable.selected_one"),
    ).toBe("{{count}} sélectionné");
  });
});
