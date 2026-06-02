import { describe, it, expect } from "vitest";
import {
	formatCompact,
	formatCompactLocale,
	formatCurrencyTooltip,
	STATUS_COLORS,
	CHART_PALETTE,
	getLocaleTag,
} from "../chart-utils";

describe("formatCompact", () => {
	it("formats small numbers as-is", () => {
		expect(formatCompact(0)).toBe("0");
		expect(formatCompact(500)).toBe("500");
		expect(formatCompact(999)).toBe("999");
	});

	it("formats thousands with k suffix", () => {
		expect(formatCompact(1000)).toBe("1k");
		expect(formatCompact(2500)).toBe("3k");
		expect(formatCompact(999999)).toBe("1000k");
	});

	it("formats millions with M suffix", () => {
		expect(formatCompact(1_000_000)).toBe("1.0M");
		expect(formatCompact(2_500_000)).toBe("2.5M");
	});
});

// Phase 6.5: locale-aware compact formatter
describe("formatCompactLocale", () => {
	it("defaults to French format", () => {
		expect(formatCompactLocale(1000)).toBe("1k");
		expect(formatCompactLocale(1_000_000)).toBe("1.0M");
	});

	it("formats Arabic locale with Arabic-Indic numerals", () => {
		expect(formatCompactLocale(1000, "ar")).toBe("١ألف");
		expect(formatCompactLocale(500, "ar")).toBe("٥٠٠");
		expect(formatCompactLocale(1_000_000, "ar")).toBe("١.٠م"); // toFixed(1) uses ASCII dot
	});

	it("formats English locale", () => {
		expect(formatCompactLocale(1000, "en")).toBe("1k");
		expect(formatCompactLocale(1_000_000, "en")).toBe("1.0M");
	});
});

describe("getLocaleTag", () => {
	it("maps app locales to BCP 47 tags", () => {
		expect(getLocaleTag("ar")).toBe("ar-DZ");
		expect(getLocaleTag("fr")).toBe("fr-DZ");
		expect(getLocaleTag("en")).toBe("en-US");
		expect(getLocaleTag("unknown")).toBe("fr-DZ");
	});
});

describe("formatCurrencyTooltip", () => {
	it("formats DZD with French-DZ locale by default", () => {
		// fr-DZ uses narrow no-break space (\u202f) as thousands separator
		expect(formatCurrencyTooltip(1500)).toBe(`1\u202f500 DZD`);
		expect(formatCurrencyTooltip(0)).toBe("0 DZD");
		expect(formatCurrencyTooltip(1_000_000)).toBe(`1\u202f000\u202f000 DZD`);
	});

	it("accepts custom currency", () => {
		expect(formatCurrencyTooltip(100, "USD")).toBe("100 USD");
	});

	it("respects locale parameter", () => {
		// Arabic locale should format differently
		const arResult = formatCurrencyTooltip(1500, "DZD", "ar");
		expect(arResult).toContain("DZD");
	});
});

// Phase 6.7: STATUS_COLORS now use CSS custom properties with fallback hex
describe("STATUS_COLORS", () => {
	it("has colors for all order statuses", () => {
		expect(STATUS_COLORS.pending).toBe("var(--color-warn-500, #f59e0b)");
		expect(STATUS_COLORS.confirmed).toBe("var(--color-brand-500, #6366f1)");
		expect(STATUS_COLORS.shipped).toBe("var(--color-brand-400, #3b82f6)");
		expect(STATUS_COLORS.delivered).toBe("var(--color-accent-500, #10b981)");
		expect(STATUS_COLORS.returned).toBe("var(--color-danger-500, #ef4444)");
		expect(STATUS_COLORS.refused).toBe("var(--color-danger-400, #dc2626)");
		expect(STATUS_COLORS.cancelled).toBe(
			"var(--color-content-tertiary, #6b7280)",
		);
		expect(STATUS_COLORS.draft).toBe("var(--color-brand-300, #8b5cf6)");
	});

	it("all values contain CSS var with hex fallback", () => {
		const pattern = /^var\(--[a-z0-9-]+,\s+#[0-9a-f]{6}\)$/;
		for (const [_status, color] of Object.entries(STATUS_COLORS)) {
			expect(color).toMatch(pattern);
		}
	});
});

describe("CHART_PALETTE", () => {
	it("has at least 10 colors", () => {
		expect(CHART_PALETTE.length).toBeGreaterThanOrEqual(10);
	});

	it("all entries are valid hex colors", () => {
		const hexRegex = /^#[0-9a-fA-F]{6}$/;
		CHART_PALETTE.forEach((color) => {
			expect(color).toMatch(hexRegex);
		});
	});

	it("has unique colors", () => {
		const unique = new Set(CHART_PALETTE);
		expect(unique.size).toBe(CHART_PALETTE.length);
	});
});

describe("formatCompact edge cases", () => {
	it("handles negative numbers", () => {
		expect(formatCompact(-500)).toBe("-500");
	});

	it("handles very large numbers", () => {
		expect(formatCompact(1_000_000_000)).toBe("1000.0M");
	});
});
