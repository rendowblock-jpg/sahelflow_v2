/**
 * @vitest-environment happy-dom
 */
/** G4 charts: with prefers-reduced-motion no chart animation may run. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useChartMotion } from "@/components/charts/chart-motion";
import { CHART_MOTION_MS } from "@/lib/motion/tokens";

function Probe() {
  const m = useChartMotion();
  return <output data-testid="m">{JSON.stringify(m)}</output>;
}
function mockMedia(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.matchMedia = globalThis.matchMedia;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("chart motion respects prefers-reduced-motion", () => {
  it("reduced: animation off and every duration 0", () => {
    mockMedia(true);
    render(<Probe />);
    const m = JSON.parse(screen.getByTestId("m").textContent ?? "{}");
    expect(m).toMatchObject({ reducedMotion: true, isAnimationActive: false, fastDuration: 0, baseDuration: 0 });
  });
  it("not reduced: the governed short durations", () => {
    mockMedia(false);
    render(<Probe />);
    const m = JSON.parse(screen.getByTestId("m").textContent ?? "{}");
    expect(m).toMatchObject({ reducedMotion: false, isAnimationActive: true, fastDuration: CHART_MOTION_MS.update, baseDuration: CHART_MOTION_MS.firstDraw });
  });
  it("only the shared engine sets animation, and it zeroes it when reduced", () => {
    const dir = resolve(__dirname, "..");
    const offenders = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && f !== "chart-motion.ts" && f !== "echarts-runtime.tsx")
      .filter((f) => /animationDuration|isAnimationActive|animation:\s*true/.test(readFileSync(resolve(dir, f), "utf8")));
    expect(offenders).toEqual([]);
    const engine = readFileSync(resolve(dir, "echarts-runtime.tsx"), "utf8");
    expect(engine).toContain("animationDuration: reducedMotion ? 0 : baseDuration");
  });
});
