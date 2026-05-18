const fs = require("fs");
function extractAllLeafPaths(code) {
	const paths = [];
	// Remove comments
	code = code.replace(/\/\/.*$/gm, "");
	// parse object structure - track keys by brace depth
	let depth = 0;
	const keyStack = [];
	const regex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:|([{}])/g;
	let m;
	while ((m = regex.exec(code)) !== null) {
		const key = m[1];
		const brace = m[2];
		if (key) {
			keyStack[depth] = key;
		} else if (brace === "{") {
			depth++;
		} else if (brace === "}") {
			if (depth > 0) {
				const path = keyStack.slice(0, depth).join(".");
				if (path && !paths.includes(path)) paths.push(path);
			}
			depth--;
		}
	}
	return paths.filter((p) => p && !p.startsWith("("));
}

function getPathsFlat(code) {
	const paths = [];
	code = code.replace(/\/\/.*$/gm, "");
	// Match quoted strings that are values (not keys)
	const lines = code.split("\n");
	const stack = [];
	for (const line of lines) {
		const indent = (line.match(/^(\s*)/)?.[1] || "").length;
		const keyMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
		if (keyMatch) {
			const key = keyMatch[1];
			// adjust stack to current indent
			while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
				stack.pop();
			}
			stack.push({ indent, key });
			// If this line has a string value, it's a leaf
			if (line.match(/:\s*["'`]/)) {
				paths.push(stack.map((s) => s.key).join("."));
			}
		}
	}
	return [...new Set(paths)];
}

const ar = fs.readFileSync("src/lib/i18n/locales/ar.ts", "utf8");
const en = fs.readFileSync("src/lib/i18n/locales/en.ts", "utf8");
const fr = fs.readFileSync("src/lib/i18n/locales/fr.ts", "utf8");
const arK = getPathsFlat(ar);
const enK = getPathsFlat(en);
const frK = getPathsFlat(fr);
console.log("ar leaf paths:", arK.length);
console.log("en leaf paths:", enK.length);
console.log("fr leaf paths:", frK.length);
const onlyEn = enK.filter((k) => !arK.includes(k));
const onlyAr = arK.filter((k) => !enK.includes(k));
const onlyFr = enK.filter((k) => !frK.includes(k));
console.log(
	"\n=== Missing from ar.ts (in en.ts) - count:",
	onlyEn.length,
	"===",
);
onlyEn.forEach((k) => console.log("  ", k));
console.log(
	"\n=== Missing from fr.ts (in en.ts) - count:",
	onlyFr.length,
	"===",
);
onlyFr.forEach((k) => console.log("  ", k));
console.log(
	"\n=== Missing from en.ts (in ar.ts) - count:",
	onlyAr.length,
	"===",
);
onlyAr.forEach((k) => console.log("  ", k));
