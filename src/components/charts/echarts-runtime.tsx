"use client";

import * as React from "react";
import { BarChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import {
  getInstanceByDom,
  init,
  use,
  type ECharts,
  type EChartsCoreOption,
} from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import { cn } from "@/lib/utils";
import { useChartMotion } from "./chart-motion";

use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  MarkLineComponent,
  MarkAreaComponent,
  AriaComponent,
  SVGRenderer,
]);

export interface SahelChartTheme {
  foreground: string;
  mutedForeground: string;
  card: string;
  popover: string;
  border: string;
  muted: string;
  primary: string;
  destructive: string;
  success: string;
  warning: string;
  info: string;
  chart: readonly [string, string, string, string, string];
  dark: boolean;
}

export type SahelEChartOptionFactory = (
  theme: SahelChartTheme,
) => EChartsCoreOption;

function token(style: CSSStyleDeclaration, name: string, fallback: string) {
  const value = style.getPropertyValue(name).trim();
  return value || fallback;
}

export function readSahelChartTheme(): SahelChartTheme {
  if (typeof document === "undefined") {
    return {
      foreground: "#111827",
      mutedForeground: "#6b7280",
      card: "#ffffff",
      popover: "#ffffff",
      border: "#e5e7eb",
      muted: "#f3f4f6",
      primary: "#059669",
      destructive: "#dc2626",
      success: "#16a34a",
      warning: "#d97706",
      info: "#2563eb",
      chart: ["#2563eb", "#d97706", "#c026d3", "#16a34a", "#0891b2"],
      dark: false,
    };
  }

  const root = document.documentElement;
  const style = getComputedStyle(root);
  return {
    foreground: token(style, "--foreground", "#111827"),
    mutedForeground: token(style, "--muted-foreground", "#6b7280"),
    card: token(style, "--card", "#ffffff"),
    popover: token(style, "--popover", "#ffffff"),
    border: token(style, "--border", "#e5e7eb"),
    muted: token(style, "--muted", "#f3f4f6"),
    primary: token(style, "--primary", "#059669"),
    destructive: token(style, "--destructive", "#dc2626"),
    success: token(style, "--success", "#16a34a"),
    warning: token(style, "--warning", "#d97706"),
    info: token(style, "--info", "#2563eb"),
    chart: [
      token(style, "--chart-1", "#2563eb"),
      token(style, "--chart-2", "#d97706"),
      token(style, "--chart-3", "#c026d3"),
      token(style, "--chart-4", "#16a34a"),
      token(style, "--chart-5", "#0891b2"),
    ],
    dark: root.classList.contains("dark"),
  };
}

function themeSignature(theme: SahelChartTheme) {
  return [
    theme.foreground,
    theme.mutedForeground,
    theme.card,
    theme.popover,
    theme.border,
    theme.muted,
    theme.primary,
    theme.destructive,
    theme.success,
    theme.warning,
    theme.info,
    ...theme.chart,
    String(theme.dark),
  ].join("|");
}

function withRuntimePolicy(
  option: EChartsCoreOption,
  ariaLabel: string,
  reducedMotion: boolean,
  baseDuration: number,
): EChartsCoreOption {
  return {
    ...option,
    animation: !reducedMotion,
    animationDuration: reducedMotion ? 0 : baseDuration,
    animationDurationUpdate: reducedMotion ? 0 : Math.min(baseDuration, 280),
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicOut",
    aria: {
      enabled: true,
      description: ariaLabel,
      decal: { show: true },
      ...((option.aria as object | undefined) ?? {}),
    },
  };
}

export function chartTooltip(theme: SahelChartTheme) {
  return {
    trigger: "axis" as const,
    confine: true,
    appendToBody: false,
    transitionDuration: 0.12,
    backgroundColor: theme.popover,
    borderColor: theme.border,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: {
      color: theme.foreground,
      fontSize: 12,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    },
    axisPointer: {
      type: "line" as const,
      snap: true,
      lineStyle: {
        color: theme.mutedForeground,
        width: 1,
        type: "dashed" as const,
        opacity: 0.55,
      },
    },
    extraCssText:
      "border-radius:10px;box-shadow:0 12px 32px rgb(0 0 0 / 0.16);backdrop-filter:blur(12px);",
  };
}

export function cartesianAxisStyle(theme: SahelChartTheme) {
  return {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: theme.mutedForeground,
      fontSize: 12,
      hideOverlap: true,
      margin: 12,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: theme.border,
        width: 1,
        type: "dashed" as const,
        opacity: theme.dark ? 0.7 : 0.85,
      },
    },
  };
}

export function chartDataZoom(
  pointCount: number,
  theme: SahelChartTheme,
): EChartsCoreOption["dataZoom"] {
  if (pointCount <= 45) return undefined;
  return [
    {
      type: "inside",
      start: Math.max(0, 100 - (45 / pointCount) * 100),
      end: 100,
      zoomOnMouseWheel: false,
      moveOnMouseWheel: false,
      moveOnMouseMove: true,
      preventDefaultMouseMove: false,
    },
    {
      type: "slider",
      height: 18,
      bottom: 1,
      borderColor: "transparent",
      backgroundColor: theme.muted,
      fillerColor: theme.border,
      dataBackground: {
        lineStyle: { color: theme.mutedForeground, opacity: 0.45 },
        areaStyle: { color: theme.mutedForeground, opacity: 0.08 },
      },
      selectedDataBackground: {
        lineStyle: { color: theme.primary, opacity: 0.7 },
        areaStyle: { color: theme.primary, opacity: 0.12 },
      },
      handleStyle: {
        color: theme.card,
        borderColor: theme.mutedForeground,
        borderWidth: 1,
      },
      moveHandleStyle: { color: theme.mutedForeground, opacity: 0.45 },
      showDetail: false,
      brushSelect: false,
    },
  ];
}

export function EChartSurface({
  option,
  ariaLabel,
  height,
  className,
  onChartReady,
}: {
  option: SahelEChartOptionFactory;
  ariaLabel: string;
  height: React.CSSProperties["height"];
  className?: string;
  onChartReady?: (chart: ECharts) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const optionRef = React.useRef(option);
  const readyRef = React.useRef(onChartReady);
  const { reducedMotion, baseDuration } = useChartMotion();

  optionRef.current = option;
  readyRef.current = onChartReady;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = init(container, undefined, {
      renderer: "svg",
      useDirtyRect: true,
    });
    readyRef.current?.(chart);

    let lastThemeSignature = "";
    let frame = 0;
    const render = () => {
      const theme = readSahelChartTheme();
      lastThemeSignature = themeSignature(theme);
      chart.setOption(
        withRuntimePolicy(
          optionRef.current(theme),
          ariaLabel,
          reducedMotion,
          baseDuration,
        ),
        { notMerge: true, lazyUpdate: false },
      );
    };

    render();

    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => chart.resize());
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      const signature = themeSignature(readSahelChartTheme());
      if (signature === lastThemeSignature) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    });
    const observerOptions: MutationObserverInit = {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-theme-preset"],
    };
    themeObserver.observe(document.documentElement, observerOptions);
    if (document.body) themeObserver.observe(document.body, observerOptions);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.dispose();
    };
  }, [ariaLabel, baseDuration, reducedMotion]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = getInstanceByDom(container);
    if (!chart) return;
    chart.setOption(
      withRuntimePolicy(
        option(readSahelChartTheme()),
        ariaLabel,
        reducedMotion,
        baseDuration,
      ),
      { notMerge: true, lazyUpdate: false },
    );
  }, [option, ariaLabel, baseDuration, reducedMotion]);

  return (
    <div
      ref={containerRef}
      data-echarts-surface="true"
      className={cn("w-full min-w-0", className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
