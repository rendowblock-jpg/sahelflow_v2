import { describe, it, expect } from "vitest";

// Test the parseNumericValue logic indirectly by reimplementing it
function parseNumericValue(str: string): {
	prefix: string;
	num: number;
	suffix: string;
} {
	const match = str.match(/^([^0-9]*)([0-9,.]+)([^0-9]*)$/);
	if (!match) return { prefix: "", num: 0, suffix: str };
	const num = parseFloat(match[2].replace(/,/g, ""));
	return { prefix: match[1], num: isNaN(num) ? 0 : num, suffix: match[3] };
}

describe("parseNumericValue", () => {
	it("parses plain numbers", () => {
		expect(parseNumericValue("123")).toEqual({
			prefix: "",
			num: 123,
			suffix: "",
		});
	});

	it("parses currency with prefix", () => {
		expect(parseNumericValue("DZD 1,500")).toEqual({
			prefix: "DZD ",
			num: 1500,
			suffix: "",
		});
	});

	it("parses percentages", () => {
		expect(parseNumericValue("85%")).toEqual({
			prefix: "",
			num: 85,
			suffix: "%",
		});
	});

	it("parses numbers with commas", () => {
		expect(parseNumericValue("1,234,567")).toEqual({
			prefix: "",
			num: 1234567,
			suffix: "",
		});
	});

	it("returns full string as suffix when no number found", () => {
		expect(parseNumericValue("N/A")).toEqual({
			prefix: "",
			num: 0,
			suffix: "N/A",
		});
	});
});
