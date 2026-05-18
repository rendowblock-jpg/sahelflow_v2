import { describe, it, expect } from "vitest";
import { parseCSV, detectDelimiter } from "../parsers";

describe("Import Parsers", () => {
	describe("parseCSV", () => {
		it("parses simple CSV", () => {
			const csv = "name,price,stock\nProduct A,1000,10\nProduct B,2000,5";
			const result = parseCSV(csv);
			expect(result.headers).toEqual(["name", "price", "stock"]);
			expect(result.rows).toHaveLength(2);
			expect(result.rows[0]).toEqual(["Product A", "1000", "10"]);
		});

		it("parses CSV with BOM", () => {
			const csv = "\uFEFFname,price\nProduct,100";
			const result = parseCSV(csv);
			expect(result.headers[0]).toBe("name");
		});

		it("parses CSV with quoted values", () => {
			const csv = 'name,description\n"Product, A","Desc, with comma"';
			const result = parseCSV(csv);
			expect(result.rows[0]).toEqual(["Product, A", "Desc, with comma"]);
		});

		it("parses CSV with empty lines", () => {
			const csv = "name,price\n\nProduct,100\n\n";
			const result = parseCSV(csv);
			expect(result.rows).toHaveLength(1);
		});

		it("handles CRLF line endings", () => {
			const csv = "name,price\r\nProduct,100\r\n";
			const result = parseCSV(csv);
			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]).toEqual(["Product", "100"]);
		});

		it("returns empty for empty string", () => {
			const result = parseCSV("");
			expect(result.headers).toHaveLength(0);
			expect(result.rows).toHaveLength(0);
		});
	});

	describe("detectDelimiter", () => {
		it("detects comma", () => {
			expect(detectDelimiter("a,b,c,d")).toBe(",");
		});

		it("detects semicolon", () => {
			expect(detectDelimiter("a;b;c;d")).toBe(";");
		});

		it("detects tab", () => {
			expect(detectDelimiter("a\tb\tc\td")).toBe("\t");
		});
	});
});
