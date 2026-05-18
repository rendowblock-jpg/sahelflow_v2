const fs = require("fs");
const path = require("path");

function findFiles(dir, ext, files = []) {
	const items = fs.readdirSync(dir);
	for (const item of items) {
		const full = path.join(dir, item);
		const stat = fs.statSync(full);
		if (
			stat.isDirectory() &&
			!item.startsWith(".") &&
			item !== "node_modules"
		) {
			findFiles(full, ext, files);
		} else if (stat.isFile() && full.endsWith(ext)) {
			files.push(full);
		}
	}
	return files;
}

const replacements = [
	// Dashboard pages
	{
		pattern: /t\.analytics\?\.loadFailed \|\| "Failed to load analytics"/,
		replacement: "t.analytics?.loadFailed || t.common.error",
	},
	{
		pattern: /t\.automation\?\.loadFailed \|\| "Failed to load orders"/,
		replacement: "t.automation?.loadFailed || t.common.error",
	},
	{
		pattern: /t\.automation\?\.confirmFailed \|\| "Failed to confirm order"/,
		replacement: "t.automation?.confirmFailed || t.common.error",
	},
	{
		pattern: /t\.automation\?\.refuseFailed \|\| "Failed to refuse order"/,
		replacement: "t.automation?.refuseFailed || t.common.error",
	},
	{
		pattern:
			/t\.automation\?\.batchConfirmFailed \|\| "Failed to confirm some orders"/,
		replacement: "t.automation?.batchConfirmFailed || t.common.error",
	},
	{
		pattern: /t\.customers\?\.loadFailed \|\| "Failed to load customers"/,
		replacement: "t.customers?.loadFailed || t.common.error",
	},
	{
		pattern:
			/t\.customers\?\.detailFailed \|\| "Failed to load customer details"/,
		replacement: "t.customers?.detailFailed || t.common.error",
	},
	{
		pattern: /t\.delivery\?\.loadFailed \|\| "Failed to load deliveries"/,
		replacement: "t.delivery?.loadFailed || t.common.error",
	},
	{
		pattern: /t\.inbox\?\.aiSuggestionsReady \|\| "AI reply suggestions ready"/,
		replacement: "t.inbox?.aiSuggestionsReady || t.common.error",
	},
	{
		pattern: /t\.inbox\?\.suggestedReplies \|\| "Suggested:"/,
		replacement: "t.inbox?.suggestedReplies || t.common.error",
	},
	{
		pattern: /data\.error \|\| "Sync failed"/,
		replacement: "data.error || t.common.error",
	},
	{
		pattern: /t\.dashboard\?\.loadFailed \|\| "Failed to load dashboard"/,
		replacement: "t.dashboard?.loadFailed || t.common.error",
	},
	{
		pattern: /t\.products\?\.loadFailed \|\| "Failed to load products"/,
		replacement: "t.products?.loadFailed || t.common.error",
	},
	{
		pattern: /t\.risk\?\.loadFailed \|\| "Failed to load risk data"/,
		replacement: "t.risk?.loadFailed || t.common.error",
	},
	{
		pattern:
			/t\.risk\?\.toggleBlockFailed \|\| "Failed to update block status"/,
		replacement: "t.risk?.toggleBlockFailed || t.common.error",
	},
	{
		pattern: /t\.shipping\?\.saveFailed \|\| "Failed to save rates"/,
		replacement: "t.shipping?.saveFailed || t.common.error",
	},
	{
		pattern: /t\.settings\.wipeSuccess \|\| "Database cleaned successfully!"/,
		replacement: "t.settings.wipeSuccess || t.common.success",
	},
	{
		pattern: /t\.settings\.channels \|\| "Channels \(WhatsApp\)"/,
		replacement: "t.settings.channels || t.common.error",
	},
	{
		pattern: /t\.settings\.wipeData \|\| "Erase Database"/,
		replacement: "t.settings.wipeData || t.common.error",
	},
];

const srcDir = path.resolve("src");
const tsxFiles = [...findFiles(srcDir, ".tsx"), ...findFiles(srcDir, ".ts")];

let totalChanges = 0;

for (const file of tsxFiles) {
	let content = fs.readFileSync(file, "utf8");
	let changed = false;

	for (const { pattern, replacement } of replacements) {
		if (pattern.test(content)) {
			content = content.replace(pattern, replacement);
			changed = true;
			totalChanges++;
			console.log(
				`[FIXED] ${path.relative(process.cwd(), file)}: ${replacement}`,
			);
		}
	}

	if (changed) {
		fs.writeFileSync(file, content);
	}
}

console.log(`\nTotal changes: ${totalChanges}`);
