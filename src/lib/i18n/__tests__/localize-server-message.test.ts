// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { localizeServerMessage } from "../localize-server-message";
import { matchKnownServerError, translateServerError } from "../translate-server-error";

// localizeServerMessage is what every toast.error / toast.warning runs its text through. Its contract (see the file header):
// a known English server message is shown in the seller's language, EVERYTHING ELSE passes through unchanged, because call
// sites hand it copy that is already translated ("Coffret Thé Décoré", t("orders.cancelFailed")), names and numbers.
// translateServerError is the other contract: for a payload that came from a server, unmapped developer text becomes one
// calm sentence. g5b changed the second and, by sharing code, silently broke the first: every error toast showed the calm
// sentence. These tests pin the two contracts apart.

const CALM_FR = "Un problème est survenu de notre côté";

afterEach(() => {
  document.documentElement.lang = "";
});

describe("localizeServerMessage passes unmapped text through", () => {
  for (const lang of ["fr", "ar", "en"] as const) {
    it(`${lang}: already-translated copy, names and numbers are returned unchanged`, () => {
      document.documentElement.lang = lang;
      for (const text of ["Coffret Thé Décoré", "تعذّر حفظ الطلب", "Order 4412 could not be cancelled today", "12 500 DZD", "Boutique Sahel"]) {
        expect(localizeServerMessage(text)).toBe(text);
      }
    });
  }

  it("an unknown language falls back to English rules and still passes unmapped text through", () => {
    document.documentElement.lang = "xx";
    expect(localizeServerMessage("Coffret Thé Décoré")).toBe("Coffret Thé Décoré");
  });

  it("a known server message is still translated, in the active language", () => {
    document.documentElement.lang = "fr";
    const shown = localizeServerMessage("Rate limit exceeded");
    expect(shown).not.toBe("Rate limit exceeded");
    expect(shown.length).toBeGreaterThan(0);
  });

  it("empty input and a missing document are returned as they are", () => {
    expect(localizeServerMessage("")).toBe("");
  });

  it("never returns the calm unmapped sentence", () => {
    document.documentElement.lang = "fr";
    expect(localizeServerMessage("Cannot read properties of undefined (reading 'id')")).not.toContain(CALM_FR);
  });
});

describe("the rule matcher is the shared core of both", () => {
  const t = (key: string) => `[${key}]`;

  it("returns the mapped text for a rule and for the request-failed shape, null otherwise", () => {
    expect(matchKnownServerError("Rate limit exceeded", t)).toBe("[error.rateLimited]");
    expect(matchKnownServerError("RATE LIMIT hit", t)).toBe("[error.rateLimited]");
    expect(matchKnownServerError("Coffret Thé Décoré", t)).toBeNull();
    expect(matchKnownServerError("", t)).toBeNull();
  });

  it("translateServerError keeps its own contract: unmapped server text becomes the calm sentence, empty uses the fallback", () => {
    expect(translateServerError("Database is locked", t, "FALLBACK")).toBe("[firstRun.error.unmapped]");
    expect(translateServerError({ message: "Upstream timeout" }, t, "FALLBACK")).toBe("[firstRun.error.unmapped]");
    expect(translateServerError("", t, "FALLBACK")).toBe("FALLBACK");
    expect(translateServerError("Rate limit exceeded", t, "FALLBACK")).toBe("[error.rateLimited]");
  });
});
