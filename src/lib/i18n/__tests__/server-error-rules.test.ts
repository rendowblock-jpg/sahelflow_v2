import { describe, expect, it } from "vitest";

import { translateServerError } from "@/lib/i18n/translate-server-error";

/** Identity t(): returns the key so tests pin the mapping contract. */
const t = (key: string) => key;
const FALLBACK = "common.error";

describe("translateServerError rule coverage", () => {
  it("maps the canonical invalid-phone producer text (strategy 1 verbatim)", () => {
    expect(
      translateServerError(
        "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
        t,
        FALLBACK,
      ),
    ).toBe("inbox.invalidPhoneFormat");
  });

  it("maps the required-phone producer text", () => {
    expect(translateServerError("Phone is required", t, FALLBACK)).toBe(
      "validation.phoneRequired",
    );
  });

  it("maps license-authority hook/store failures", () => {
    expect(
      translateServerError(
        "License authority returned an invalid response",
        t,
        FALLBACK,
      ),
    ).toBe("license.status.unavailable");
    expect(
      translateServerError("License authority is unavailable", t, FALLBACK),
    ).toBe("license.status.unavailable");
  });

  it("maps native shop-lifecycle failures", () => {
    expect(
      translateServerError(
        "Native shop lifecycle is available only in the desktop application",
        t,
        FALLBACK,
      ),
    ).toBe("shops.lifecycleError");
    expect(
      translateServerError(
        "Native shop lifecycle did not return an authenticated pending receipt",
        t,
        FALLBACK,
      ),
    ).toBe("shops.lifecycleError");
  });

  it("keeps matching case-insensitive and keeps the fallback contract", () => {
    expect(
      translateServerError("LICENSE AUTHORITY FILE IS UNREADABLE", t, FALLBACK),
    ).toBe("license.status.unavailable");
    expect(translateServerError("", t, FALLBACK)).toBe(FALLBACK);
    expect(translateServerError(undefined, t, FALLBACK)).toBe(FALLBACK);
  });
});
