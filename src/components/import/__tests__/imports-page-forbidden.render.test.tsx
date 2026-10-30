/**
 * @vitest-environment happy-dom
 */
/**
 * The /imports server page for a member who may do nothing here: one calm "not allowed" surface and no import card.
 * And for a member who may import everything: the three cards and no "not allowed" surface. Permission checks mocked.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ImportsPage from "@/app/(dashboard)/imports/page";
import en from "@/lib/i18n/locales/en.json";
import { render } from "@/test-utils/render";

const h = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/lib/i18n-server", async () => {
  const table = (await import("@/lib/i18n/locales/en.json")).default as Record<string, string>;
  return { getI18n: async () => ({ t: (key: string) => table[key] ?? key, locale: "en" }) };
});
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => ({ shop: { shopId: "shop-a" } })),
  trustedActionAllowed: () => h.allowed,
}));
vi.mock("@/hooks/use-i18n", async () => {
  const table = (await import("@/lib/i18n/locales/en.json")).default as Record<string, string>;
  const t = (key: string) => table[key] ?? key;
  return { useI18n: () => ({ t, locale: "en", dir: "ltr" }) };
});

const T = (key: string): string => (en as Record<string, string>)[key] ?? key;

beforeEach(() => {
  h.allowed = false;
});

describe("/imports page permissions", () => {
  it("forbidden: says so, offers no import card and no file input", async () => {
    const { container } = render(await ImportsPage());
    expect(screen.getByText(T("error.forbidden"))).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("allowed: three import cards and no forbidden surface", async () => {
    h.allowed = true;
    const { container } = render(await ImportsPage());
    expect(screen.queryByText(T("error.forbidden"))).toBeNull();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(3);
  });
});
