import { describe, it, expect } from "vitest";
import {
	toLocalFormat,
	toInternationalFormat,
	isValidAlgerianPhone,
	cleanPhone,
	ALGERIAN_PHONE_LOCAL,
	ALGERIAN_PHONE_INTERNATIONAL,
} from "../phone-utils";

describe("cleanPhone", () => {
	it("strips non-digit characters", () => {
		expect(cleanPhone("05 55-12.34 56")).toBe("0555123456");
		expect(cleanPhone("+213 555 123 456")).toBe("213555123456");
	});
});

describe("toLocalFormat", () => {
	it("converts international format to local", () => {
		expect(toLocalFormat("213555123456")).toBe("0555123456");
		expect(toLocalFormat("213655123456")).toBe("0655123456");
		expect(toLocalFormat("213755123456")).toBe("0755123456");
	});

	it("preserves already-local format", () => {
		expect(toLocalFormat("0555123456")).toBe("0555123456");
	});

	it("handles bare format without leading 0 or 213", () => {
		expect(toLocalFormat("555123456")).toBe("0555123456");
	});

	it("returns null for invalid numbers", () => {
		expect(toLocalFormat("12345")).toBeNull();
		expect(toLocalFormat("0444123456")).toBeNull(); // 04 not valid
		expect(toLocalFormat("213444123456")).toBeNull(); // 2134 not valid
	});
});

describe("toInternationalFormat", () => {
	it("converts local format to international", () => {
		expect(toInternationalFormat("0555123456")).toBe("213555123456");
		expect(toInternationalFormat("0655123456")).toBe("213655123456");
	});

	it("preserves already-international format", () => {
		expect(toInternationalFormat("213555123456")).toBe("213555123456");
	});

	it("handles bare format", () => {
		expect(toInternationalFormat("555123456")).toBe("213555123456");
	});

	it("returns null for invalid numbers", () => {
		expect(toInternationalFormat("12345")).toBeNull();
	});
});

describe("isValidAlgerianPhone", () => {
	it("validates local format", () => {
		expect(isValidAlgerianPhone("0555123456")).toBe(true);
		expect(isValidAlgerianPhone("0655123456")).toBe(true);
		expect(isValidAlgerianPhone("0755123456")).toBe(true);
	});

	it("validates international format", () => {
		expect(isValidAlgerianPhone("213555123456")).toBe(true);
	});

	it("validates with formatting characters", () => {
		expect(isValidAlgerianPhone("+213 555 123 456")).toBe(true);
		expect(isValidAlgerianPhone("05 55 12 34 56")).toBe(true);
	});

	it("rejects invalid numbers", () => {
		expect(isValidAlgerianPhone("0444123456")).toBe(false);
		expect(isValidAlgerianPhone("1234")).toBe(false);
		expect(isValidAlgerianPhone("")).toBe(false);
	});
});

describe("ALGERIAN_PHONE regexes", () => {
	it("LOCAL matches 05/06/07 with 8 more digits", () => {
		expect(ALGERIAN_PHONE_LOCAL.test("0555123456")).toBe(true);
		expect(ALGERIAN_PHONE_LOCAL.test("0444123456")).toBe(false);
	});

	it("INTERNATIONAL matches 213[5-7] with 8 more digits", () => {
		expect(ALGERIAN_PHONE_INTERNATIONAL.test("213555123456")).toBe(true);
		expect(ALGERIAN_PHONE_INTERNATIONAL.test("213444123456")).toBe(false);
	});
});
