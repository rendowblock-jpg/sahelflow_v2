const fs = require("fs");

function parseLocale(filePath) {
	const code = fs.readFileSync(filePath, "utf8");
	const lines = code.split("\n");
	const entries = new Map();
	const stack = [];

	let inMultiline = false;
	let multilineKey = null;
	let multilineIndent = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const indent = (line.match(/^(\s*)/)?.[1] || "").length;

		// If we're in a multiline string, check if we've returned to normal indentation
		if (inMultiline) {
			if (
				indent <= multilineIndent &&
				line.trim() !== "" &&
				!line.trim().startsWith("//")
			) {
				inMultiline = false;
				multilineKey = null;
			} else {
				continue;
			}
		}

		const keyMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);

		if (keyMatch) {
			const key = keyMatch[1];
			// adjust stack to current indent
			while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
				stack.pop();
			}
			stack.push({ indent, key });

			const hasValueOnSameLine = line.match(/:\s*["']/);
			// Check if next line is a continuation (indented further, starts with a quote)
			const nextLine = lines[i + 1];
			const isMultilineStart =
				hasValueOnSameLine &&
				nextLine &&
				(nextLine.match(/^\s+["'`]/) ||
					line.trim().endsWith('"""') ||
					line.trim().endsWith("'''"));
			const isTemplateLiteral = hasValueOnSameLine && line.includes("\`");

			if (hasValueOnSameLine && !isMultilineStart) {
				const path = stack.map((s) => s.key).join(".");
				entries.set(path, true);
			} else if (hasValueOnSameLine && isMultilineStart) {
				const path = stack.map((s) => s.key).join(".");
				entries.set(path, true);
				inMultiline = true;
				multilineIndent = indent;
				multilineKey = path;
			} else if (
				!hasValueOnSameLine &&
				nextLine &&
				nextLine.match(/^\s+["'`]/)
			) {
				// Value starts on next line (indented)
				const path = stack.map((s) => s.key).join(".");
				entries.set(path, true);
				inMultiline = true;
				multilineIndent = indent;
				multilineKey = path;
			}
		}
	}
	return entries;
}

const ar = parseLocale("src/lib/i18n/locales/ar.ts");
const en = parseLocale("src/lib/i18n/locales/en.ts");
const fr = parseLocale("src/lib/i18n/locales/fr.ts");

const frMissing = [...en.keys()].filter((k) => !fr.has(k));
const enMissing = [...ar.keys()].filter((k) => !en.has(k));

console.log("fr.ts truly missing keys:", frMissing.length);
console.log("en.ts truly missing keys:", enMissing.length);

if (frMissing.length > 0) {
	console.log("\n=== fr.ts actually missing ===");
	frMissing.forEach((k) => console.log(" ", k));
}
if (enMissing.length > 0) {
	console.log("\n=== en.ts actually missing ===");
	enMissing.forEach((k) => console.log(" ", k));
}
