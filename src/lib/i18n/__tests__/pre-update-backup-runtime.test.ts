import { describe, expect, it } from "vitest";

import { getPreUpdateBackupRuntimeTranslation } from "../pre-update-backup-runtime";
import { getRuntimeTranslation } from "../runtime-translations";

const KEYS = [
  "updater.backup.running",
  "updater.backup.chipRunning",
  "updater.backup.done",
  "updater.backup.skipped",
  "updater.backup.failed",
  "updater.backup.timedOut",
] as const;
const LOCALES = ["ar", "fr", "en"] as const;

describe("pre-update backup copy", () => {
  it.each(LOCALES.flatMap((locale) => KEYS.map((key) => [locale, key] as const)))(
    "%s %s exists and is registered",
    (locale, key) => {
      const text = getPreUpdateBackupRuntimeTranslation(locale, key);
      expect(text && text.trim().length > 3).toBe(true);
      expect(getRuntimeTranslation(locale, key)).toBe(text);
    },
  );

  it("the skipped text carries the age in every language", () => {
    for (const locale of LOCALES) {
      expect(getPreUpdateBackupRuntimeTranslation(locale, "updater.backup.skipped")).toContain("{{minutes}}");
    }
  });

  it("the failure text says plainly that the update goes on and data is untouched", () => {
    expect(getPreUpdateBackupRuntimeTranslation("en", "updater.backup.failed")).toBe(
      "Backup failed. Updating anyway, your data is not touched by the update.",
    );
    expect(getPreUpdateBackupRuntimeTranslation("en", "updater.backup.timedOut")).toContain("Updating anyway");
  });

  it("Arabic is Arabic and French is not English", () => {
    for (const key of KEYS) {
      expect(getPreUpdateBackupRuntimeTranslation("ar", key)).toMatch(/[\u0600-\u06FF]/);
      expect(getPreUpdateBackupRuntimeTranslation("en", key)).not.toMatch(/[\u0600-\u06FF]/);
      expect(getPreUpdateBackupRuntimeTranslation("fr", key)).not.toBe(getPreUpdateBackupRuntimeTranslation("en", key));
    }
  });

  it("an unknown key is left to the next catalog", () => {
    expect(getPreUpdateBackupRuntimeTranslation("en", "updater.backup.nope")).toBeUndefined();
  });
});
