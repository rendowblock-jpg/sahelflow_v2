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

// Find a bundle file + its signature by extension pattern.
// If multiple files match `ext`, returns the first one (callers that need
// arch-specific selection should use findBundleByName instead).
function findBundle(subdir: string, ext: string): { path: string; sig: string } | null {
  const dir = join(BUNDLE_DIR, subdir);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir).filter((f) => f.endsWith(ext));
  const bundleFile = files[0];
  if (!bundleFile) return null;

  return readBundleSig(dir, bundleFile);
}

// T-M4: list every bundle file in `subdir` matching `ext` (used by the macOS
// section to pick per-arch .dmg files when Tauri builds separate aarch64 and
// x86_64 bundles instead of one universal binary).
function listBundles(subdir: string, ext: string): string[] {
  const dir = join(BUNDLE_DIR, subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(ext) && !f.endsWith(`${ext}.sig`));
}

// Find a bundle file by substring (e.g. "aarch64") + read its .sig sibling.
function findBundleByName(subdir: string, ext: string, needle: string): { path: string; sig: string } | null {
  const matches = listBundles(subdir, ext).filter((f) => f.includes(needle));
  const file = matches[0];
  if (!file) return null;
  const dir = join(BUNDLE_DIR, subdir);
  return readBundleSig(dir, file);
}

// Find a bundle file that does NOT contain any of the `exclude` substrings
// (used to identify the universal .dmg: it matches .dmg but contains neither
// "aarch64" nor "x86_64").
function findBundleExcluding(subdir: string, ext: string, exclude: string[]): { path: string; sig: string } | null {
  const matches = listBundles(subdir, ext).filter((f) => !exclude.some((x) => f.includes(x)));
  const file = matches[0];
  if (!file) return null;
  const dir = join(BUNDLE_DIR, subdir);
  return readBundleSig(dir, file);
}

function readBundleSig(dir: string, bundleFile: string): { path: string; sig: string } | null {
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

  // macOS — T-M4: detect arch from the .dmg filename instead of assuming a
  // universal binary. Tauri may produce either one universal .dmg (covers both
  // arches) OR two per-arch .dmg files (`...aarch64.dmg` + `...x86_64.dmg`).
  // We try per-arch first, then fall back to a universal dmg for both arches.
  const dmgArm = findBundleByName("dmg", ".dmg", "aarch64");
  const dmgX64 = findBundleByName("dmg", ".dmg", "x86_64");
  const dmgUniversal = findBundleExcluding("dmg", ".dmg", ["aarch64", "x86_64"]);

  const macosArm = dmgArm ?? dmgUniversal;
  const macosX64 = dmgX64 ?? dmgUniversal;
  if (macosArm) {
    const url = `https://github.com/rendowblock-jpg/sahelflow_v2/releases/download/v${version}/${macosArm.path}`;
    platforms["darwin-aarch64"] = { signature: macosArm.sig, url };
  }
  if (macosX64) {
    const url = `https://github.com/rendowblock-jpg/sahelflow_v2/releases/download/v${version}/${macosX64.path}`;
    platforms["darwin-x86_64"] = { signature: macosX64.sig, url };
  }
  if (macosArm || macosX64) {
    const armName = macosArm?.path ?? "(none)";
    const x64Name = macosX64?.path ?? "(none)";
    const isUniversal = dmgUniversal && !dmgArm && !dmgX64;
    console.log(`  ✅ macOS: arm=${armName} x64=${x64Name}${isUniversal ? " (universal)" : ""}`);
  } else if (listBundles("dmg", ".dmg").length > 0) {
    // .dmg files exist but none have a matching .sig
    console.warn("  ⚠️  macOS .dmg found but no signature readable — skipping darwin entries");
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
