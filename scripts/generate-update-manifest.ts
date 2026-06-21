#!/usr/bin/env bun
/**
 * Generate the Tauri updater manifest (latest.json) from built artifacts.
 *
 * Run AFTER `bun run tauri:build` (which produces the .dmg/.msi/.AppImage +
 * .sig files in src-tauri/target/release/bundle/).
 *
 * Usage:
 *   bun run scripts/generate-update-manifest.ts [--version <semver>] [--notes <text>]
 *
 * Output: src-tauri/target/release/latest.json
 *
 * Then upload this file + the platform bundles to a GitHub Release.
 * The updater fetches it from:
 *   https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest/download/latest.json
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const BUNDLE_DIR = join(process.cwd(), "src-tauri", "target", "release", "bundle");
const OUTPUT_PATH = join(BUNDLE_DIR, "..", "latest.json");

// Read version from tauri.conf.json
function getVersion(): string {
  const conf = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf-8"),
  ) as { version: string };
  return conf.version;
}

// Find a bundle file + its signature by extension pattern
function findBundle(subdir: string, ext: string): { path: string; sig: string } | null {
  const dir = join(BUNDLE_DIR, subdir);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir);
  const bundleFile = files.find((f) => f.endsWith(ext));
  if (!bundleFile) return null;

  const sigFile = `${bundleFile}.sig`;
  const sigPath = join(dir, sigFile);
  if (!existsSync(sigPath)) {
    console.warn(`  ⚠️  No signature found for ${bundleFile} (expected ${sigFile})`);
    return null;
  }

  return {
    path: bundleFile,
    sig: readFileSync(sigPath, "utf-8").trim(),
  };
}

async function main(): Promise<void> {
  const versionArg = process.argv[process.argv.indexOf("--version") + 1];
  const notesArg = process.argv[process.argv.indexOf("--notes") + 1];
  const version = versionArg ?? getVersion();
  const notes = notesArg ?? `SahelFlow ${version}`;

  console.log(`📦 Generating update manifest for v${version}...`);

  // Find platform bundles
  // macOS: .dmg (darwin-aarch64, darwin-x86_64)
  // Windows: .msi (windows-x86_64)
  // Linux: .AppImage (linux-x86_64)
  const platforms: Record<string, { signature: string; url: string }> = {};

  // macOS — detect architecture from the bundle dir name
  const macosBundle = findBundle("dmg", ".dmg");
  if (macosBundle) {
    // Tauri builds universal binaries by default on macOS (aarch64 + x86_64)
    // We publish one .dmg that covers both
    const url = `https://github.com/rendowblock-jpg/sahelflow_v2/releases/download/v${version}/${macosBundle.path}`;
    platforms["darwin-aarch64"] = { signature: macosBundle.sig, url };
    platforms["darwin-x86_64"] = { signature: macosBundle.sig, url };
    console.log(`  ✅ macOS: ${macosBundle.path}`);
  }

  // Windows
  const windowsBundle = findBundle("msi", ".msi");
  if (windowsBundle) {
    const url = `https://github.com/rendowblock-jpg/sahelflow_v2/releases/download/v${version}/${windowsBundle.path}`;
    platforms["windows-x86_64"] = { signature: windowsBundle.sig, url };
    console.log(`  ✅ Windows: ${windowsBundle.path}`);
  }

  // Linux
  const linuxBundle = findBundle("appimage", ".AppImage");
  if (linuxBundle) {
    const url = `https://github.com/rendowblock-jpg/sahelflow_v2/releases/download/v${version}/${linuxBundle.path}`;
    platforms["linux-x86_64"] = { signature: linuxBundle.sig, url };
    console.log(`  ✅ Linux: ${linuxBundle.path}`);
  }

  if (Object.keys(platforms).length === 0) {
    console.error("❌ No platform bundles found. Run `bun run tauri:build` first.");
    process.exit(1);
  }

  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  console.log("");
  console.log(`✅ Manifest written to: ${OUTPUT_PATH}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Create a GitHub Release tagged v${version}`);
  console.log("  2. Upload these files to the release:");
  for (const p of Object.values(platforms)) {
    console.log(`     - ${p.url.split("/").pop()}`);
  }
  console.log(`     - latest.json`);
  console.log("  3. Users will see the update on next launch.");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
