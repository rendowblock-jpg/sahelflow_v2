/**
 * @vitest-environment happy-dom
 */
/**
 * StatCard `compactOnPhone` (31 Oct 2026, w214): an opt-in smaller tile for phones. Backwards compatible: leaving it out
 * (or false) changes nothing; turning it on only ADDS max-md: classes (so nothing changes from 768 px up) and one data attribute.
 */
import { cleanup, render } from "@testing-library/react";
import { Clock } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatCard } from "@/components/shared/stat-card";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ locale: "en", t: (key: string) => key }),
}));

afterEach(cleanup);

type Extra = { compactOnPhone?: boolean };
function card(extra: Extra = {}) {
  const props = { label: "Pending", value: "123 456 DZD", icon: <Clock />, href: "/orders?status=pending", hrefLabel: "Pending", ...extra };
  const { container } = render(
    <TooltipProvider>
      <StatCard {...props} />
    </TooltipProvider>,
  );
  const root = container.firstElementChild as HTMLElement;
  const label = Array.from(root.querySelectorAll("span")).find((el) => el.textContent === "Pending") as HTMLElement;
  const figure = Array.from(root.querySelectorAll("div")).find((el) => el.textContent === "123 456 DZD" && el.children.length === 0) as HTMLElement;
  const iconTile = root.querySelector("svg")?.parentElement as HTMLElement;
  return { root, label, labelRow: label.parentElement as HTMLElement, figure, iconTile, html: container.innerHTML };
}

const tokens = (el: Element) => [...el.classList];

describe("StatCard compactOnPhone", () => {
  it("is off by default: no data attribute and no max-md: class anywhere", () => {
    const { root, html } = card();
    expect(root.getAttribute("data-stat-compact")).toBeNull();
    expect(html).not.toContain("max-md:");
  });

  it("false is the same output as leaving the prop out", () => {
    expect(card({ compactOnPhone: false }).html).toBe(card().html);
  });

  it("marks the tile and gives it the compact phone classes", () => {
    const c = card({ compactOnPhone: true });
    expect(c.root.getAttribute("data-stat-compact")).toBe("phone");
    expect(tokens(c.root)).toEqual(expect.arrayContaining(["max-md:px-2.5", "max-md:py-2"]));
    expect(tokens(c.labelRow)).toContain("max-md:min-h-6");
    expect(tokens(c.label)).toContain("max-md:line-clamp-1");
    expect(tokens(c.iconTile)).toEqual(expect.arrayContaining(["max-md:size-6", "max-md:[&_svg]:size-3.5"]));
    expect(tokens(c.figure)).toEqual(expect.arrayContaining(["max-md:text-lg", "max-md:leading-6", "max-md:mt-0.5"]));
  });

  it("keeps the figure on one line with tabular digits", () => {
    const c = card({ compactOnPhone: true });
    expect(tokens(c.figure)).toEqual(expect.arrayContaining(["whitespace-nowrap", "tabular-nums"]));
  });

  it("only ADDS max-md: classes: nothing the default has is removed, so 768 px and up cannot change", () => {
    const base = card();
    const compact = card({ compactOnPhone: true });
    const all = (root: Element) => [root, ...Array.from(root.querySelectorAll("*"))];
    const a = all(base.root);
    const b = all(compact.root);
    expect(b).toHaveLength(a.length);
    b.forEach((el, index) => {
      const before = tokens(a[index] as Element);
      const after = tokens(el);
      expect(before.filter((token) => !after.includes(token))).toEqual([]);
      for (const added of after.filter((token) => !before.includes(token))) expect(added).toMatch(/^max-md:/);
    });
  });

  it("shows the same information as the default tile", () => {
    expect(card({ compactOnPhone: true }).root.textContent).toBe(card().root.textContent);
    expect(card({ compactOnPhone: true }).root.querySelector("a")?.getAttribute("href")).toBe("/orders?status=pending");
  });
});
