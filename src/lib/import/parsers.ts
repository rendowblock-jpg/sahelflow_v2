/**
 * Universal Import Parsers
 * Supports CSV, XLSX, and raw 2D arrays
 */

import * as XLSX from "xlsx";

export type RawRow = (string | number | null | undefined)[];

export interface ParseResult {
	headers: string[];
	rows: RawRow[];
	sheetName?: string;
	totalSheets?: number;
}

const BOM = "\uFEFF";

function cleanCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	return String(value).trim();
}

export function parseCSV(text: string): ParseResult {
	const cleanText = text
		.replace(new RegExp(`^${BOM}`), "")
		.replace(/\r\n/g, "\n");
	const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);

	if (lines.length === 0) {
		return { headers: [], rows: [] };
	}

	const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
	const rows: RawRow[] = [];

	for (let i = 1; i < lines.length; i++) {
		const cells = parseCSVLine(lines[i]);
		if (cells.length > 0 && cells.some((c) => c.length > 0)) {
			rows.push(cells.map(cleanCell));
		}
	}

	return { headers, rows };
}

function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			result.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	result.push(current.trim());
	return result;
}

export function parseXLSX(buffer: ArrayBuffer, sheetIndex = 0): ParseResult {
	const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
	const sheetName = workbook.SheetNames[sheetIndex];
	const worksheet = workbook.Sheets[sheetName];
	const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
		header: 1,
		defval: "",
	});

	if (json.length === 0) {
		return {
			headers: [],
			rows: [],
			sheetName,
			totalSheets: workbook.SheetNames.length,
		};
	}

	const headers = (json[0] as unknown as unknown[]).map((h) =>
		String(h).toLowerCase().trim(),
	);
	const rows: RawRow[] = [];

	for (let i = 1; i < json.length; i++) {
		const raw = json[i] as unknown as unknown[];
		if (raw.some((c) => String(c).trim().length > 0)) {
			rows.push(raw.map((c) => cleanCell(c)));
		}
	}

	return { headers, rows, sheetName, totalSheets: workbook.SheetNames.length };
}

export function parseRawRows(rows: unknown[][]): ParseResult {
	if (rows.length === 0) return { headers: [], rows: [] };
	const headers = rows[0].map((h) => String(h).toLowerCase().trim());
	const dataRows = rows.slice(1).map((r) => r.map((c) => cleanCell(c)));
	return { headers, rows: dataRows };
}

export function detectDelimiter(sample: string): string {
	const delimiters = [",", ";", "\t", "|"];
	const counts = delimiters.map((d) => {
		const esc = d === "|" ? "\\|" : d === "\t" ? "\\t" : d;
		return (sample.match(new RegExp(esc, "g")) || []).length;
	});
	const maxIndex = counts.indexOf(Math.max(...counts));
	return delimiters[maxIndex];
}
