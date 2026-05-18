#!/usr/bin/env node
/**
 * Build-time translation audit script
 * Scans src/ for hardcoded English strings that should be translated
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(process.cwd(), "src");
const EXTS = new Set([".tsx", ".ts"]);

// Patterns that are OK to be in English
const ALLOWED = [
	/^https?:\/\//, // URLs
	/^\/[a-z/]+$/, // Route paths
	/^[a-z-]+(--[a-z-]+)?$/, // CSS class names
	/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/, // t.something patterns
	/^#[0-9a-fA-F]{3,8}$/, // Hex colors
	/^[a-z]+-[0-9]+$/, // Tailwind-like classes
	/^[A-Z][a-z]+Icon$/, // Icon components
	/^[A-Z][a-zA-Z]+$/, // React component names
	/^(lg|md|sm|xl|xs)$/, // Size strings
	/^(ltr|rtl|auto)$/, // Direction
	/^(left|right|center|top|bottom|start|end)$/, // Position
	/^(GET|POST|PUT|DELETE|PATCH)$/, // HTTP methods
	/^(json|text|blob|formData)$/, // Fetch response types
	/^[a-z][a-zA-Z]+Error$/, // Error type names
	/^[a-z]+_([a-z]+_?)*$/, // Snake case constants
	/^[a-z]+[A-Z][a-zA-Z]+$/, // camelCase identifiers
	/^(true|false|null|undefined)$/, // Literals
	/^--[a-z-]+$/, // CSS variables
	/^[a-z]+\/[a-z-]+$/, // MIME type-ish
	/^(success|error|warning|info)$/, // Toast types
	/^(light|dark|system)$/, // Theme values
	/^(ar|en|fr|dz)$/, // Locale codes
	/^[a-z]+_[a-z]+$/, // Underscore constants
	/^(id|key|name|title|type|value|className|style|children|onClick)$/, // Common props
	/^(role|aria-[a-z]+|data-[a-z]+)$/, // ARIA/data attributes
	/^(crypto|Date|JSON|Math|Object|Array|String|Number|Boolean)$/, // Globals
	/^(map|filter|reduce|join|split|slice|trim|replace|match|test|toString)$/, // Common methods
	/^(push|pop|shift|unshift|splice|concat|includes|indexOf|find|some|every)$/, // Array methods
];

// Specific string values that are always OK
const ALLOWED_LITERALS = new Set([
	"use client",
	"use strict",
	"production",
	"development",
	"test",
	"staging",
	"localhost",
	"sahelflow",
	"SahelFlow",
	"whatsapp",
	"WhatsApp",
	"shopify",
	"Shopify",
	"woocommerce",
	"WooCommerce",
	"youcan",
	"YouCan",
	"yalidine",
	"Yalidine",
	"DA",
	"DA",
	"DZD",
	"UTC",
	"GMT",
	"UTF-8",
	"base64",
	"sha256",
	"hmac",
	"uuid",
	"v4",
	"CSV",
	"XLSX",
	"PDF",
	"API",
	"URL",
	"OTP",
	"2FA",
	"QR",
	"SSE",
	"RPC",
	"RLS",
	"DOM",
	"CSS",
	"HTML",
	"JSX",
	"TSX",
	"SQL",
	"JSON",
	"XML",
	"CSV",
	"HMAC",
	"SHA256",
	"UTF8",
	"SMS",
	"COD",
	"CCP",
	"stopPropagation",
	"preventDefault",
	" passive",
	"capture",
	"bubble",
]);

function shouldFlag(str: string): boolean {
	if (str.length < 3) return false;
	if (ALLOWED_LITERALS.has(str)) return false;
	if (ALLOWED.some((re) => re.test(str))) return false;
	// Contains Arabic? Probably OK
	if (/[\u0600-\u06FF]/.test(str)) return false;
	// Contains French accents? Probably OK
	if (/[àâäéèêëïîôùûüç]/.test(str)) return false;
	// Numbers only? OK
	if (/^[\d\s,.:%$]+$/.test(str)) return false;
	// Looks like a CSS value
	if (/^(\d+(px|rem|em|%|vh|vw|s|ms)|rgba?\(|#[0-9a-fA-F]{3,8})$/.test(str))
		return false;
	return true;
}

function findFiles(dir: string, files: string[] = []): string[] {
	for (const item of readdirSync(dir)) {
		const full = join(dir, item);
		const st = statSync(full);
		if (st.isDirectory() && !item.startsWith(".") && item !== "__tests__") {
			findFiles(full, files);
		} else if (st.isFile() && EXTS.has(full.slice(full.lastIndexOf(".")))) {
			files.push(full);
		}
	}
	return files;
}

function extractStringLiterals(
	code: string,
): { value: string; line: number }[] {
	const results: { value: string; line: number }[] = [];
	const lines = code.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Skip imports and comments
		if (line.trim().startsWith("import ") || line.trim().startsWith("//"))
			continue;

		// Match double-quoted strings
		const dquote = [...line.matchAll(/"([^"\\]*(\\.[^"\\]*)*)"/g)];
		for (const m of dquote) {
			results.push({ value: m[1].replace(/\\"/g, '"'), line: i + 1 });
		}

		// Match single-quoted strings (but not JSX attributes with single quotes)
		const squote = [...line.matchAll(/'([^'\\]*(\\.[^'\\]*)*)'/g)];
		for (const m of squote) {
			results.push({ value: m[1].replace(/\\'/g, "'"), line: i + 1 });
		}
	}
	return results;
}

const files = findFiles(ROOT);
let totalFlags = 0;

for (const file of files) {
	const rel = relative(process.cwd(), file);
	const code = readFileSync(file, "utf8");
	const literals = extractStringLiterals(code);
	const flagged: { value: string; line: number }[] = [];

	for (const lit of literals) {
		if (shouldFlag(lit.value)) {
			flagged.push(lit);
		}
	}

	if (flagged.length > 0) {
		console.log(`\n📄 ${rel}`);
		for (const f of flagged) {
			console.log(
				`   Line ${f.line}: "${f.value.substring(0, 60)}${f.value.length > 60 ? "..." : ""}"`,
			);
			totalFlags++;
		}
	}
}

if (totalFlags === 0) {
	console.log("✅ Zero untranslated strings detected!");
	process.exit(0);
} else {
	console.log(`\n⚠️  Found ${totalFlags} potentially untranslated string(s).`);
	console.log(
		"Review the flagged strings above. Some may be intentional (e.g. component names, API routes).",
	);
	process.exit(0); // Don't fail build, just warn
}
