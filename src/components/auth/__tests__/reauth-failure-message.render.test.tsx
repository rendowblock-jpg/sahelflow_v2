/**
 * @vitest-environment happy-dom
 */
/**
 * F-0023 round 2: a client timeout is its own outcome ("slow"), not "unavailable" and not "session expired": the
 * server may still finish and rotate the session, so the seller must wait and reload instead of retrying at once.
 * Every outcome needs a sentence in all three languages; adding an outcome without copy must fail here.
 */
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import type { ReauthFailure } from "@/lib/auth/reauthenticate-client";

import { REAUTH_FAILURE_COPY_KEYS, ReauthFailureMessage, reauthFailureText } from "../reauth-failure-message";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const cache: Record<string, (key: string) => string> = {};
  const stable = (locale: "en" | "fr" | "ar") => (cache[locale] ??= (key: string) => tables[locale]?.[key] ?? key);
  return { useI18n: () => ({ t: stable(harness.locale), locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }) };
});

const KINDS = ["incorrect", "locked", "session-expired", "unavailable", "invalid", "slow"] as const satisfies readonly ReauthFailure["kind"][];

async function table(locale: "en" | "fr" | "ar"): Promise<(key: string) => string> {
  const data = (await import(`@/lib/i18n/locales/${locale}.json`)).default as Record<string, string>;
  return (key) => data[key] ?? key;
}

afterEach(() => {
  harness.locale = "en";
});

describe("reauth failure copy", () => {
  it("has a copy key for exactly the outcomes the helper can return", () => {
    expect(Object.keys(REAUTH_FAILURE_COPY_KEYS).sort()).toEqual([...KINDS].sort());
  });

  it.each(["en", "fr", "ar"] as const)("says something real for every outcome in %s (never the raw key)", async (locale) => {
    const t = await table(locale);
    const seen = new Set<string>();
    for (const kind of KINDS) {
      const text = reauthFailureText({ kind } as ReauthFailure, t);
      expect(text, `${locale}/${kind}`).not.toBe(REAUTH_FAILURE_COPY_KEYS[kind]);
      expect(text.trim().length, `${locale}/${kind}`).toBeGreaterThan(5);
      seen.add(text);
    }
    // Six outcomes, six different sentences: the seller is never told the same thing for two different situations.
    expect(seen.size).toBe(KINDS.length);
  });

  it("slow tells the seller to wait, then reload before trying again, in three languages", async () => {
    expect(reauthFailureText({ kind: "slow" }, await table("en"))).toBe(
      "This is taking longer than usual. Wait a few seconds, then reload the page before trying again.",
    );
    expect(reauthFailureText({ kind: "slow" }, await table("fr"))).toBe(
      "Cela prend plus de temps que d’habitude. Patientez quelques secondes, puis rechargez la page avant de réessayer.",
    );
    expect(reauthFailureText({ kind: "slow" }, await table("ar"))).toBe(
      "يستغرق هذا وقتًا أطول من المعتاد. انتظر بضع ثوانٍ ثم أعد تحميل الصفحة قبل المحاولة مجددًا.",
    );
  });

  it("renders slow as an alert without a sign-in link (the session is not known to be dead)", () => {
    render(<ReauthFailureMessage failure={{ kind: "slow" }} />);
    expect(screen.getByRole("alert").textContent).toContain("taking longer than usual");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("still offers the sign-in link for an expired session", () => {
    render(<ReauthFailureMessage failure={{ kind: "session-expired" }} />);
    expect(screen.getByRole("link", { name: "Sign in again." }).getAttribute("href")).toBe("/login");
  });
});
