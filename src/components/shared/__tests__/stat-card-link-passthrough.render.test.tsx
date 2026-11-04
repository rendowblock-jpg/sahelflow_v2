/**
 * @vitest-environment happy-dom
 */
/**
 * s42 r51: the dashboard stat cards. The whole card is a stretched link; the sparkline block above it is raised (z-10) only so the
 * interactive chart can take touch input. The production sweep of Internal.50 (elementFromPoint on a 7 x 7 grid, real touch taps) found
 * 26-33 of 49 points on the link for Orders / Analytics / Customers: the date line under the chart and the gaps around it swallowed the tap.
 * Now only the chart is interactive; the rest of the block lets the tap through to the link.
 */
import { cleanup, render } from "@testing-library/react";
import { Clock } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatCard } from "@/components/shared/stat-card";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ locale: "en", t: (key: string) => key }),
}));

afterEach(cleanup);

const dated = Array.from({ length: 7 }, (_v, i) => ({ value: i + 1, date: `2026-10-${String(20 + i).padStart(2, "0")}` }));
const undated = Array.from({ length: 7 }, (_v, i) => ({ value: i + 1 }));

function card(spark: Array<{ value: number; date?: string }>) {
  const { container } = render(
    <TooltipProvider>
      <StatCard
        label="Orders"
        value="1 234"
        icon={<Clock />}
        href="/orders"
        hrefLabel="Orders"
        spark={spark}
        sparkContext="Last 7 days"
      />
    </TooltipProvider>,
  );
  const root = container.firstElementChild as HTMLElement;
  return {
    root,
    block: root.querySelector('[data-stat-sparkline="true"]') as HTMLElement,
    chart: root.querySelector('[data-stat-sparkline-chart="true"]') as HTMLElement | null,
    slider: root.querySelector('[data-sparkline-interactive="true"]') as HTMLElement | null,
    context: root.querySelector('[data-stat-sparkline-context="true"]') as HTMLElement,
    link: root.querySelector('[data-stat-link="true"]') as HTMLElement,
  };
}

// pointer-events is inherited: the effective value of an element is the first explicit class on it or on the nearest ancestor that has one.
function effectivePointerEvents(el: HTMLElement | null, stop: HTMLElement): "none" | "auto" | "inherit-default" {
  for (let node: HTMLElement | null = el; node && node !== stop.parentElement; node = node.parentElement) {
    if (node.classList.contains("pointer-events-none")) return "none";
    if (node.classList.contains("pointer-events-auto")) return "auto";
  }
  return "inherit-default";
}

describe("StatCard stretched link and the sparkline block", () => {
  it("lets taps on the date line and the gaps through to the link (block is pointer-events-none)", () => {
    const { root, block, context, link } = card(dated);
    expect(link).not.toBeNull();
    expect(block.className).toContain("pointer-events-none");
    expect(block.className).toContain("z-10");
    expect(effectivePointerEvents(context, root)).toBe("none");
  });

  it("keeps the interactive chart interactive (pointer-events-auto on the chart alone)", () => {
    const { root, chart, slider } = card(dated);
    expect(slider).not.toBeNull();
    expect(chart).not.toBeNull();
    expect(chart!.className).toContain("pointer-events-auto");
    expect(chart!.contains(slider)).toBe(true);
    expect(effectivePointerEvents(slider, root)).toBe("auto");
  });

  it("an undated, decorative trend never takes a tap away from the link", () => {
    const { root, block, slider, chart } = card(undated);
    expect(slider).toBeNull();
    expect(chart).toBeNull();
    expect(block.className).toContain("pointer-events-none");
    const decor = block.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(effectivePointerEvents(decor, root)).toBe("none");
  });

  it("changes nothing for a card without a link: no stretched link, same blocks", () => {
    const { container } = render(
      <TooltipProvider>
        <StatCard label="Orders" value="1 234" icon={<Clock />} spark={dated} sparkContext="Last 7 days" />
      </TooltipProvider>,
    );
    expect(container.querySelector('[data-stat-link="true"]')).toBeNull();
    expect(container.querySelector('[data-sparkline-interactive="true"]')).not.toBeNull();
  });
});
