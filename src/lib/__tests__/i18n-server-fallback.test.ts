/**
 * i18n-server fallback chain — d6 finding #3 (packaged-artifact locale load).
 *
 * The packaged standalone server reads `src/lib/i18n/locales/<locale>.json`
 * from process.cwd() at runtime (outputFileTracingIncludes + the
 * build-frontend.ts copy guarantee the files exist). These tests prove what
 * happens when BOTH of those layers fail: the loader must degrade visibly —
 * a coded one-time-per-locale warning through the structured logger — instead
 * of silently rendering dotted keys, and getI18n must keep returning a
 * working translator (raw-key fallback) rather than crashing the render.
 *
 * Each test re-imports the module registry (vi.resetModules) so the loader's
 * per-process translation cache and one-time warning set start clean, making
 * the warning-dedupe and cache-miss assertions order-independent.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Controllable fs + logger + request state ────────────────────────────────
const fsState = vi.hoisted(() => ({
  exists: true,
  readError: false as string | false,
}));
const loggerWarn = vi.hoisted(() => vi.fn());
const localeState = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  acceptLanguage: undefined as string | undefined,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: () => fsState.exists,
    readFileSync: (path: unknown, options: unknown) => {
      if (fsState.readError !== false) {
        throw new Error(fsState.readError);
      }
      return actual.readFileSync(path as never, options as never);
    },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerWarn,
    error: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (key: string) =>
      key === "sahelflow-locale" && localeState.cookieValue !== undefined
        ? { value: localeState.cookieValue }
        : undefined,
  })),
  headers: vi.fn(async () => ({
    get: (key: string) =>
      key === "accept-language" && localeState.acceptLanguage !== undefined
        ? localeState.acceptLanguage
        : undefined,
  })),
}));

type I18nServerModule = typeof import("@/lib/i18n-server");
let i18nServer: I18nServerModule;

beforeEach(async () => {
  fsState.exists = true;
  fsState.readError = false;
  localeState.cookieValue = undefined;
  localeState.acceptLanguage = undefined;
  vi.resetModules();
  i18nServer = await import("@/lib/i18n-server");
});

function warnsForLocale(locale: string): number {
  return loggerWarn.mock.calls.filter(
    (call) =>
      call[0] === "i18n.server_locale_file_missing" &&
      (call[1] as { locale?: string }).locale === locale,
  ).length;
}

describe("loadTranslationsSync — runtime file fallback chain", () => {
  it("returns {} and logs one coded warning when the locale file is missing", () => {
    fsState.exists = false;
    expect(i18nServer.loadTranslationsSync("fr")).toEqual({});
    // Repeat loads stay silent — the signal is one-per-locale, not per-request.
    expect(i18nServer.loadTranslationsSync("fr")).toEqual({});
    expect(warnsForLocale("fr")).toBe(1);
    const call = loggerWarn.mock.calls.find(
      (candidate) => candidate[0] === "i18n.server_locale_file_missing",
    );
    expect(call).toBeDefined();
    expect((call?.[1] as { impact?: string }).impact).toContain(
      "runtime dictionaries and raw keys",
    );
  });

  it("returns {} and logs a coded warning when the read itself fails", () => {
    fsState.exists = true;
    fsState.readError = "EACCES: simulated packaged-artifact permission failure";
    expect(i18nServer.loadTranslationsSync("en")).toEqual({});
    expect(warnsForLocale("en")).toBe(1);
  });

  it("still loads real dictionaries when the runtime read succeeds (mock wiring proof)", () => {
    const translations = i18nServer.loadTranslationsSync("ar");
    expect(translations["common.save"]).toBe("حفظ");
    expect(warnsForLocale("ar")).toBe(0);
  });

  it("keeps getI18n returning a raw-key translator instead of crashing the render", async () => {
    fsState.exists = false;
    // English keeps the raw-key assertion exact: an ar failure would wrap the
    // Latin key in bidi isolates (stabilizeBidiText) before surfacing it.
    localeState.cookieValue = "en";
    const { t, locale, dir } = await i18nServer.getI18n();
    // Observable failure mode: the static dictionary is gone, `common.save` is
    // not runtime-owned copy, so the raw dotted key surfaces — loudly, with a
    // coded warning emitted for this locale.
    expect(t("common.save")).toBe("common.save");
    expect(locale).toBe("en");
    expect(dir).toBe("ltr");
    expect(warnsForLocale("en")).toBe(1);
  });
});
