import type { ReactNode } from "react";

export type ChartThemeConfig = Record<"light" | "dark", string>;

export type ChartConfig = Record<
  string,
  {
    label?: ReactNode;
    color?: string;
    theme?: ChartThemeConfig;
  }
>;

export interface ChartReferenceLine {
  value: number;
  label: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
}

export interface ChartReferenceBand {
  from: number;
  to: number;
  label?: string;
  color?: string;
}
