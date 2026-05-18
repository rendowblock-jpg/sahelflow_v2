import { describe, it, expect } from "vitest";
import {
	formatCompact,
	formatCurrencyTooltip,
	STATUS_COLORS,
	CHART_PALETTE,
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

describe("formatCurrencyTooltip", () => {
	it("formats DZD with French-DZ locale", () => {
		// fr-DZ uses narrow no-break space (\u202f) as thousands separator
		expect(formatCurrencyTooltip(1500)).toBe(`1\u202f500 DZD`);
		expect(formatCurrencyTooltip(0)).toBe("0 DZD");
		expect(formatCurrencyTooltip(1_000_000)).toBe(`1\u202f000\u202f000 DZD`);
	});

	it("accepts custom currency", () => {
		expect(formatCurrencyTooltip(100, "USD")).toBe("100 USD");
	});
});

describe("STATUS_COLORS", () => {
	it("has colors for all order statuses", () => {
		expect(STATUS_COLORS.pending).toBe("#f59e0b");
		expect(STATUS_COLORS.confirmed).toBe("#6366f1");
		expect(STATUS_COLORS.shipped).toBe("#3b82f6");
		expect(STATUS_COLORS.delivered).toBe("#10b981");
		expect(STATUS_COLORS.returned).toBe("#ef4444");
		expect(STATUS_COLORS.refused).toBe("#dc2626");
		expect(STATUS_COLORS.cancelled).toBe("#6b7280");
		expect(STATUS_COLORS.draft).toBe("#8b5cf6");
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
