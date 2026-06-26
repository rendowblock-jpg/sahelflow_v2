/**
 * SahelFlow — Local installer builder
 *
 * Builds a real installable desktop app (.msi on Windows, .dmg on macOS,
 * .AppImage on Linux) on your local machine. No GitHub Actions needed.
 *
 * Prerequisites:
 *   - Rust toolchain (https://rustup.rs)
 *   - The Tauri signing private key (stored as env var or in ~/.sahelflow/)
 *
 * Usage:
 *   bun run scripts/build-installer-local.ts
 *
 * Output:
 *   src-tauri/target/release/bundle/{msi,dmg,appimage}/SahelFlow_*.{msi,dmg,AppImage}
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const RED = "\x1b[0;31m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

function ok(msg: string) { console.log(`${GREEN}✅ ${msg}${NC}`); }
function warn(msg: string) { console.log(`${YELLOW}${msg}${NC}`); }
function err(msg: string) { console.log(`${RED}❌ ${msg}${NC}`); }
function hdr(msg: string) { console.log(`\n${BOLD}── ${msg} ──${NC}`); }

const ROOT = process.cwd();
const PRIVATE_KEY_PATH = resolve(process.env.HOME || process.env.USERPROFILE || "", ".sahelflow", "tauri-updater-private.key");
const FALLBACK_KEY_PATH = resolve(ROOT, "..", "tauri-updater-private.key");

console.log(`${BOLD}═══════════════════════════════════════════════════`);
console.log(`  SahelFlow — Local Installer Builder`);
console.log(`═══════════════════════════════════════════════════${NC}`);

// ── Step 1: Check prerequisites ─────────────────────────────────────────────
hdr("1. Checking prerequisites");

// Check Rust
try {
  const rustVersion = execSync("rustc --version", { stdio: "pipe" }).toString().trim();
  ok(`Rust: ${rustVersion}`);
} catch {
  err("Rust not installed. Install from: https://rustup.rs");
  process.exit(1);
}

// Check Tauri CLI
try {
  const tauriVersion = execSync("bunx tauri --version", { stdio: "pipe" }).toString().trim();
  ok(`Tauri CLI: ${tauriVersion}`);
} catch {
  err("Tauri CLI not available. Run: bun install");
  process.exit(1);
}

// Find the signing private key
let privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY || "";
if (!privateKey) {
  if (existsSync(PRIVATE_KEY_PATH)) {
    privateKey = readFileSync(PRIVATE_KEY_PATH, "utf-8").trim();
    ok(`Private key: ${PRIVATE_KEY_PATH}`);
  } else if (existsSync(FALLBACK_KEY_PATH)) {
    privateKey = readFileSync(FALLBACK_KEY_PATH, "utf-8").trim();
    ok(`Private key: ${FALLBACK_KEY_PATH}`);
  } else {
    warn("No signing private key found. The build will work but updates won't be signed.");
    warn("To enable auto-updates, save the private key to:");
    warn(`  ${PRIVATE_KEY_PATH}`);
    warn("OR set the TAURI_SIGNING_PRIVATE_KEY env var");
  }
}

// ── Step 2: Install dependencies ────────────────────────────────────────────
hdr("2. Installing dependencies");
try {
  execSync("bun install", { stdio: "inherit", cwd: ROOT });
  ok("Dependencies installed");
} catch {
  err("Failed to install dependencies");
  process.exit(1);
}

// ── Step 3: Build the frontend ──────────────────────────────────────────────
hdr("3. Building frontend (next build, ~30-60s)");
try {
  execSync("bun run build", { stdio: "inherit", cwd: ROOT });
  ok("Frontend built");
} catch {
  err("Frontend build failed");
  process.exit(1);
}

// ── Step 4: Build the Tauri app (produces the installer) ─────────────────────
hdr("4. Building desktop installer (this takes 5-15 min on first run)");
warn("Rust compilation is slow the first time. Subsequent builds are faster.");

const env: Record<string, string> = {
  ...process.env,
  ...(privateKey ? { TAURI_SIGNING_PRIVATE_KEY: privateKey } : {}),
  ...(process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD !== undefined
    ? { TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }
    : { TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" }),
};

try {
  execSync("bunx tauri build", { stdio: "inherit", cwd: ROOT, env });
  ok("Desktop installer built");
} catch {
  err("Tauri build failed");
  process.exit(1);
}

// ── Step 5: Find + display the built installers ─────────────────────────────
hdr("5. Built installers");

const BUNDLE_DIR = resolve(ROOT, "src-tauri", "target", "release", "bundle");
if (!existsSync(BUNDLE_DIR)) {
  err(`Bundle directory not found: ${BUNDLE_DIR}`);
  process.exit(1);
}

const installers: string[] = [];
function findInstallers(dir: string) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findInstallers(fullPath);
    } else if (entry.name.match(/\.(msi|dmg|AppImage|exe|deb|appimage)$/i)) {
      installers.push(fullPath);
    }
  }
}
findInstallers(BUNDLE_DIR);

if (installers.length === 0) {
  warn("No installer files found. Check src-tauri/target/release/bundle/");
} else {
  console.log(`\n${GREEN}📦 Installers ready:${NC}`);
  for (const installer of installers) {
    const relPath = installer.replace(ROOT + "/", "");
    console.log(`  ${GREEN}${relPath}${NC}`);
  }
}

// ── Step 6: Instructions ────────────────────────────────────────────────────
hdr("6. Next steps");
console.log(`
${BOLD}To install:${NC}
  - Windows: double-click the .msi file
  - macOS: open the .dmg, drag SahelFlow to Applications
  - Linux: chmod +x the .AppImage, then double-click or run ./SahelFlow_*.AppImage

${BOLD}To distribute:${NC}
  1. Create a GitHub Release: https://github.com/rendowblock-jpg/sahelflow_v2/releases/new
  2. Upload the installer file(s) + their .sig files
  3. Run: bun run scripts/generate-update-manifest.ts
  4. Upload the latest.json to the same release
  5. Publish the release

${BOLD}For auto-updates to work:${NC}
  The installed app will check for updates on launch from:
  https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest/download/latest.json
`);
