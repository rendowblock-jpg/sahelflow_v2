"use client";

/**
 * SahelFlow Chart Utilities
 * Bridges the CSS design system with Recharts components.
 * All colors read from CSS custom properties for dark/light theme support.
 */

export const THEME_COLORS = {
	brand: {
		50: "var(--color-brand-50)",
		100: "var(--color-brand-100)",
		200: "var(--color-brand-200)",
		300: "var(--color-brand-300)",
		400: "var(--color-brand-400)",
		500: "var(--color-brand-500)",
		600: "var(--color-brand-600)",
	},
	accent: {
		400: "var(--color-accent-400)",
		500: "var(--color-accent-500)",
	},
	warn: {
		400: "var(--color-warn-400)",
		500: "var(--color-warn-500)",
	},
	danger: {
		400: "var(--color-danger-400)",
		500: "var(--color-danger-500)",
	},
	surface: {
		primary: "var(--color-surface-primary)",
		secondary: "var(--color-surface-secondary)",
		tertiary: "var(--color-surface-tertiary)",
	},
	content: {
		primary: "var(--color-content-primary)",
		secondary: "var(--color-content-secondary)",
		tertiary: "var(--color-content-tertiary)",
	},
	line: {
		primary: "var(--color-line-primary)",
		secondary: "var(--color-line-secondary)",
	},
} as const;

/** Status color mapping for charts — matches dashboard badges */
export const STATUS_COLORS: Record<string, string> = {
	pending: "#f59e0b",
	confirmed: "#6366f1",
	shipped: "#3b82f6",
	delivered: "#10b981",
	returned: "#ef4444",
	refused: "#dc2626",
	cancelled: "#6b7280",
	draft: "#8b5cf6",
};

/** Generic palette for when status isn't known */
export const CHART_PALETTE = [
	"#3b9eff",
	"#10b981",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#06b6d4",
	"#f97316",
	"#ec4899",
	"#84cc16",
	"#6366f1",
];

/** Tooltip wrapper styles — injected into Recharts Tooltip */
export const tooltipStyle = {
	backgroundColor: "var(--color-surface-secondary)",
	border: "1px solid var(--color-line-primary)",
	borderRadius: "var(--radius-md)",
	padding: "10px 14px",
	boxShadow: "var(--shadow-lg)",
};

export const tooltipLabelStyle = {
	color: "var(--color-content-primary)",
	fontSize: "13px",
	fontWeight: 600,
	marginBottom: "6px",
};

export const tooltipItemStyle = {
	color: "var(--color-content-secondary)",
	fontSize: "12px",
};

/** Grid stroke color */
export const gridStroke = "var(--color-line-secondary)";

/** Axis tick styles */
export const axisTickStyle = {
	fill: "var(--color-content-tertiary)",
	fontSize: 11,
};

export const axisLineStyle = { stroke: "var(--color-line-primary)" };

/** Format a number as compact (e.g. 12k, 1.5M) */
export function formatCompact(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return String(value);
}

/** Currency formatter for tooltips */
export function formatCurrencyTooltip(value: number, currency = "DZD"): string {
	return `${value.toLocaleString("fr-DZ")} ${currency}`;
}
