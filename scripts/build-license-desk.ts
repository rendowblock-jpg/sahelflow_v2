#!/usr/bin/env bun
/**
 * Build the SahelFlow License Desk: one self-contained, offline HTML file the
 * Founder opens in a browser to issue permanent licences without a terminal.
 *
 *   bun run scripts/build-license-desk.ts [--check]
 *
 * Output: tools/license-desk/sahelflow-license-desk.html (committed, so it can
 * be downloaded straight from GitHub). `--check` rebuilds in memory and fails
 * when the committed file is stale.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deskDir = join(root, "tools/license-desk");
const outputPath = join(deskDir, "sahelflow-license-desk.html");
const placeholder = "/*__DESK_SCRIPT__*/";

const buildDir = mkdtempSync(join(tmpdir(), "sf-license-desk-"));
let bundled: string;
try {
  const bundlePath = join(buildDir, "desk.js");
  execFileSync(
    "bun",
    [
      "build",
      join(deskDir, "desk-ui.ts"),
      "--target=browser",
      "--format=iife",
      "--minify",
      `--outfile=${bundlePath}`,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  bundled = readFileSync(bundlePath, "utf8");
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}

// An inline script must never contain its own closing tag.
const script = bundled.replace(/<\/script/gi, "<\\/script");
const template = readFileSync(join(deskDir, "template.html"), "utf8");
if (!template.includes(placeholder)) {
  console.error("License Desk template is missing its script placeholder");
  process.exit(1);
}
const html = template.replace(placeholder, () => script);

if (process.argv.includes("--check")) {
  const committed = readFileSync(outputPath, "utf8");
  if (committed !== html) {
    console.error(
      "tools/license-desk/sahelflow-license-desk.html is stale: run bun run scripts/build-license-desk.ts",
    );
    process.exit(1);
  }
  console.log("License Desk is up to date.");
} else {
  writeFileSync(outputPath, html);
  console.log(`License Desk written to ${outputPath} (${html.length} bytes)`);
}
