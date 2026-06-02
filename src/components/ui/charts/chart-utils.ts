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

/**
 * Status color mapping for charts — Phase 6.7
 * Now uses CSS custom properties for theme consistency instead of hardcoded hex.
 * Falls back to hex for Recharts SVG fills that can't resolve CSS vars at render time.
 */
export const STATUS_COLORS: Record<string, string> = {
	pending: "var(--color-warn-500, #f59e0b)",
	confirmed: "var(--color-brand-500, #6366f1)",
	shipped: "var(--color-brand-400, #3b82f6)",
	delivered: "var(--color-accent-500, #10b981)",
	returned: "var(--color-danger-500, #ef4444)",
	refused: "var(--color-danger-400, #dc2626)",
	cancelled: "var(--color-content-tertiary, #6b7280)",
	draft: "var(--color-brand-300, #8b5cf6)",
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

/**
 * Format a number as compact (e.g. 12k, 1.5M).
 * Kept single-param for Recharts tickFormatter compatibility.
 */
export function formatCompact(value: number): string {
	return formatCompactLocale(value);
}

/**
 * Locale-aware compact formatter (e.g. 12k, ١٢ألف, 1.5M, ١٫٥م).
 * Phase 6.5: Supports Arabic-Indic numerals.
 */
export function formatCompactLocale(value: number, locale: string = "fr"): string {
	if (value >= 1_000_000) {
		const formatted = (value / 1_000_000).toFixed(1);
		return locale === "ar"
			? `${toArabicNumerals(formatted)}م`
			: `${formatted}M`;
	}
	if (value >= 1_000) {
		const rounded = Math.round(value / 1_000);
		return locale === "ar"
			? `${toArabicNumerals(String(rounded))}ألف`
			: `${rounded}k`;
	}
	return locale === "ar" ? toArabicNumerals(String(value)) : String(value);
}

/** Convert Western digits to Arabic-Indic numerals */
function toArabicNumerals(str: string): string {
	const map: Record<string, string> = {
		"0": "٠",
		"1": "١",
		"2": "٢",
		"3": "٣",
		"4": "٤",
		"5": "٥",
		"6": "٦",
		"7": "٧",
		"8": "٨",
		"9": "٩",
	};
	return str.replace(/[0-9]/g, (d) => map[d] || d);
}

/**
 * Get the BCP 47 locale tag for Number.toLocaleString from app locale.
 * Phase 6.6: Maps app locale to proper BCP 47 tags.
 */
export function getLocaleTag(locale: string): string {
	switch (locale) {
		case "ar":
			return "ar-DZ";
		case "fr":
			return "fr-DZ";
		case "en":
			return "en-US";
		default:
			return "fr-DZ";
	}
}

/**
 * Currency formatter for tooltips.
 * Phase 6.5: Accepts locale for proper numeral formatting.
 */
export function formatCurrencyTooltip(
	value: number,
	currency = "DZD",
	locale: string = "fr",
): string {
	return `${value.toLocaleString(getLocaleTag(locale))} ${currency}`;
}
