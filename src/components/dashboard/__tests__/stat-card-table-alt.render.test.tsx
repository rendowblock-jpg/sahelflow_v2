/**
 * @vitest-environment happy-dom
 */
/**
 * StatCard `tableAlt`: the optional hidden table behind a mini-trend.
 * Backwards compatible: leaving it out changes nothing, giving it adds exactly
 * one table and nothing else.
 */
import { cleanup, render } from "@testing-library/react";
import { Wallet } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatCard, type StatCardTableAlt } from "@/components/shared/stat-card";
import { TooltipProvider } from "@/components/ui/tooltip";

const lang = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ locale: lang.locale, t: (key: string) => key }),
}));

afterEach(cleanup);

const spark = [
  { value: 120000, date: "2026-10-28" },
  { value: 98000, date: "2026-10-29" },
  { value: 184000, date: "2026-10-30" },
];
const table: StatCardTableAlt = {
  caption: "Orders value, last 3 days",
  columns: ["Day", "Orders value"],
  rows: [
    ["28 Oct", "120,000 DZD"],
    ["29 Oct", "98,000 DZD"],
    ["30 Oct", "184,000 DZD"],
  ],
};

function html(extra: Partial<React.ComponentProps<typeof StatCard>>) {
  const { container } = render(
    <TooltipProvider>
      <StatCard label="Orders value" value="184,000 DZD" icon={<Wallet />} spark={spark} sparkFormat="currency" {...extra} />
    </TooltipProvider>,
  );
  const out = container.innerHTML.replace(/:r[0-9a-z]+:|«r[0-9a-z]+»|radix-[^"\s]+/g, "ID");
  const tables = container.querySelectorAll("table");
  cleanup();
  return { out, tables };
}

describe("StatCard tableAlt", () => {
  it("leaving tableAlt out renders no table and equals tableAlt={undefined} byte for byte", () => {
    const omitted = html({});
    const explicitUndefined = html({ tableAlt: undefined });
    expect(omitted.tables.length).toBe(0);
    expect(omitted.out).not.toContain("<table");
    expect(explicitUndefined.out).toBe(omitted.out);
  });

  it("providing it adds exactly one table with the given rows and nothing else", () => {
    const without = html({});
    lang.locale = "en";
    const { container } = render(
      <TooltipProvider>
        <StatCard label="Orders value" value="184,000 DZD" icon={<Wallet />} spark={spark} sparkFormat="currency" tableAlt={table} />
      </TooltipProvider>,
    );
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(1);
    const only = tables[0]!;
    expect(only.querySelector("caption")?.textContent).toBe(table.caption);
    expect([...only.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual([...table.columns]);
    const bodyRows = [...only.querySelectorAll("tbody tr")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent));
    expect(bodyRows).toEqual(table.rows.map((row) => row.map(String)));
    expect(only.className).toContain("sr-only");
    expect(only.getAttribute("aria-hidden")).toBeNull();
    // Take the table out again: what is left is the card without the prop.
    only.remove();
    const rest = container.innerHTML.replace(/:r[0-9a-z]+:|«r[0-9a-z]+»|radix-[^"\s]+/g, "ID");
    expect(rest).toBe(without.out);
  });

  it("cells are printed as given: a formatted DZD amount is never re-formatted or drifted", () => {
    const money = { ...table, rows: [["30 Oct", "1 234 568 DZD"], ["31 Oct", "0 DZD"]] };
    const { container } = render(
      <TooltipProvider>
        <StatCard label="x" value="1" icon={<Wallet />} spark={spark} tableAlt={money} />
      </TooltipProvider>,
    );
    const cells = [...container.querySelectorAll("tbody td")].map((cell) => cell.textContent);
    expect(cells).toEqual(["30 Oct", "1 234 568 DZD", "31 Oct", "0 DZD"]);
  });

  it("without a sparkline there is no orphan table", () => {
    const { container } = render(
      <TooltipProvider>
        <StatCard label="x" value="1" icon={<Wallet />} tableAlt={table} />
      </TooltipProvider>,
    );
    expect(container.querySelectorAll("table").length).toBe(0);
  });
});
