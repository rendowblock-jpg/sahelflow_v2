import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { attachmentContentDisposition } from "@/lib/import/export-disposition";
import { getLicenseLockoutRuntimeTranslation } from "@/lib/i18n/license-lockout-runtime";
import { isLockoutAllowed } from "../lockout-allowlist";
import {
  backupSize,
  downloadFileName,
  LOCKOUT_EXPORT_ENTITIES,
  lockoutExportFallbackName,
  lockoutExportUrl,
  rescueFailureFromStatus,
} from "../lockout-data-rescue";

describe("what the lockout screen fetches is what the licence gate leaves open", () => {
  it.each(LOCKOUT_EXPORT_ENTITIES)("the %s download is an allowed GET", (entity) => {
    expect(lockoutExportUrl(entity)).toBe(`/api/export/${entity}?format=csv`);
    expect(isLockoutAllowed("GET", lockoutExportUrl(entity))).toBe(true);
    expect(lockoutExportFallbackName(entity)).toBe(`sahelflow-${entity}.csv`);
  });

  it("the backup button is an allowed POST", () => {
    expect(isLockoutAllowed("POST", "/api/backup/create")).toBe(true);
  });
});

describe("downloadFileName", () => {
  const FALLBACK = "sahelflow-orders.csv";
  it.each([
    [null, FALLBACK],
    ["", FALLBACK],
    ["inline", FALLBACK],
    ['attachment; filename="orders-2026.csv"', "orders-2026.csv"],
    ["attachment; filename=orders.csv", "orders.csv"],
    ["attachment; filename*=UTF-8''orders%202026.csv", "orders 2026.csv"],
    ["attachment; filename*=UTF-8''%ZZ; filename=\"plain.csv\"", "plain.csv"],
    ['attachment; filename="../../etc/passwd"', ".._.._etc_passwd".replace(/^\.+/, "")],
    ['attachment; filename="a\\b:c*d?e.csv"', "a_b_c_d_e.csv"],
    ['attachment; filename=""', FALLBACK],
    ['attachment; filename="..."', FALLBACK],
  ])("reads %j", (header, expected) => {
    expect(downloadFileName(header, FALLBACK)).toBe(expected);
  });

  it("reads the Arabic name the export routes really send", () => {
    const header = attachmentContentDisposition("الطلبيات-2026.csv", "orders-2026.csv");
    expect(downloadFileName(header, FALLBACK)).toBe("الطلبيات-2026.csv");
  });

  it("never returns a path separator, even from a hostile header", () => {
    for (const header of [
      "attachment; filename*=UTF-8''..%2F..%2Fx.csv",
      "attachment; filename*=UTF-8''%5C%5Cserver%5Cshare%5Cx.csv",
      'attachment; filename="C:\\Windows\\x.csv"',
    ]) {
      expect(downloadFileName(header, FALLBACK)).not.toMatch(/[\\/:]/);
    }
  });
});

describe("rescueFailureFromStatus", () => {
  it.each([
    [401, "signIn"],
    [403, "forbidden"],
    [400, "failed"],
    [404, "failed"],
    [500, "failed"],
    [503, "failed"],
    [0, "failed"],
  ])("status %i is %s", (status, expected) => {
    expect(rescueFailureFromStatus(status)).toBe(expected);
  });
});

describe("backupSize", () => {
  it.each([
    [0, null],
    [-5, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    ["2048", null],
    [undefined, null],
    [null, null],
    [1, { value: 1, unit: "KB" }],
    [2048, { value: 2, unit: "KB" }],
    [1024 * 1024 - 1, { value: 1024, unit: "KB" }],
    [1024 * 1024, { value: 1, unit: "MB" }],
    [5 * 1024 * 1024, { value: 5, unit: "MB" }],
    [Math.round(12.44 * 1024 * 1024), { value: 12.4, unit: "MB" }],
    [1024 ** 3, { value: 1, unit: "GB" }],
  ])("%j", (bytes, expected) => {
    expect(backupSize(bytes)).toEqual(expected);
  });
});

describe("lockout data copy", () => {
  const KEYS = [
    "title", "description", "downloadTitle", "downloadHint", "preparing", "downloaded",
    "backupTitle", "backupDescription", "backupButton", "backupBusy", "backupDone", "backupDoneSize",
    "error.signIn", "error.forbidden", "error.failed", "error.network", "signIn",
    ...LOCKOUT_EXPORT_ENTITIES.map((entity) => `entity.${entity}`),
  ].map((suffix) => `license.lockout.data.${suffix}`);

  it.each(["en", "fr", "ar"] as const)("%s has every key, none empty", (locale) => {
    for (const key of KEYS) {
      expect(getLicenseLockoutRuntimeTranslation(locale, key)?.trim(), `${locale} ${key}`).toBeTruthy();
    }
  });

  it("Arabic keys hold Arabic letters, French and English differ", () => {
    for (const key of KEYS.filter((k) => k !== "license.lockout.data.signIn")) {
      expect(getLicenseLockoutRuntimeTranslation("ar", key), key).toMatch(/[\u0600-\u06FF]/);
    }
    for (const key of KEYS) {
      expect(getLicenseLockoutRuntimeTranslation("fr", key), key).not.toBe(
        getLicenseLockoutRuntimeTranslation("en", key),
      );
    }
  });

  it("the screen uses no key the catalogue does not have", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/license/lockout-data-rescue.tsx"),
      "utf8",
    );
    // Literal keys only; the entity and error keys are built from a template and covered by KEYS.
    const literal = [...source.matchAll(/"(license\.lockout\.data\.[A-Za-z.]+)"/g)].map((match) => match[1]);
    expect(literal.length).toBeGreaterThan(8);
    for (const key of literal) expect(KEYS, String(key)).toContain(key);
  });
});
