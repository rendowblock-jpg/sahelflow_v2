/**
 * SahelFlow — One-command release
 *
 * Usage: bun run release [--version <semver>] [--notes <text>]
 *
 * What it does:
 *   1. Bumps version in tauri.conf.json + package.json
 *   2. Commits + tags (vX.Y.Z) + pushes to main
 *   3. Builds the installer (.msi on Windows, .dmg on macOS, .AppImage on Linux)
 *   4. Signs the build (auto-detects private key)
 *   5. Generates latest.json manifest
 *   6. Creates a GitHub Release + uploads all files
 *   7. Publishes the release
 *
 * After this completes, all installed apps auto-update on next launch.
 *
 * Prerequisites:
 *   - GitHub PAT stored at ~/.sahelflow/github-pat (or GITHUB_TOKEN env var)
 *   - Tauri signing private key at ~/.sahelflow/tauri-updater-private.key
 *   - Rust toolchain installed
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const RED = "\x1b[0;31m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

function ok(msg: string) { console.log(`${GREEN}✅ ${msg}${NC}`); }
function warn(msg: string) { console.log(`${YELLOW}${msg}${NC}`); }
function err(msg: string) { console.error(`${RED}❌ ${msg}${NC}`); }
function hdr(msg: string) { console.log(`\n${BOLD}═══ ${msg} ═══${NC}`); }

const ROOT = process.cwd();
const SAHELFLOW_DIR = resolve(process.env.HOME || process.env.USERPROFILE || "", ".sahelflow");
const PRIVATE_KEY_PATH = resolve(SAHELFLOW_DIR, "tauri-updater-private.key");
const PAT_PATH = resolve(SAHELFLOW_DIR, "github-pat");

// Parse args
const args = process.argv.slice(2);
let versionArg = "";
let notesArg = "SahelFlow update";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--version" && args[i + 1]) { versionArg = args[++i] as string; }
  else if (args[i] === "--notes" && args[i + 1]) { notesArg = args[++i] as string; }
}

console.log(`${BOLD}═══════════════════════════════════════════════════`);
console.log(`  SahelFlow — One-Command Release`);
console.log(`═══════════════════════════════════════════════════${NC}`);

// ── 1. Determine version ─────────────────────────────────────────────────────
hdr("1. Determine version");
let version: string;
if (versionArg) {
  version = versionArg;
} else {
  // Read current version from tauri.conf.json + bump patch
  const conf = JSON.parse(readFileSync(resolve(ROOT, "src-tauri", "tauri.conf.json"), "utf-8"));
  const current = conf.version.split(".").map(Number);
  current[2] = (current[2] || 0) + 1;
  version = current.join(".");
}
ok(`Version: ${version}`);

// ── 2. Check prerequisites ──────────────────────────────────────────────────
hdr("2. Checking prerequisites");

// Check private key
if (!existsSync(PRIVATE_KEY_PATH)) {
  err(`Tauri signing private key not found at: ${PRIVATE_KEY_PATH}`);
  err("Save the private key to that path first.");
  process.exit(1);
}
ok("Signing private key found");

// Check GitHub PAT
let githubPat = process.env.GITHUB_TOKEN || "";
if (!githubPat && existsSync(PAT_PATH)) {
  githubPat = readFileSync(PAT_PATH, "utf-8").trim();
}
if (!githubPat) {
  err("GitHub PAT not found. Save it to: " + PAT_PATH);
  err("OR set the GITHUB_TOKEN env var.");
  process.exit(1);
}
ok("GitHub PAT found");

// Check git remote
try {
  execSync("git remote get-url origin", { stdio: "pipe", cwd: ROOT });
  ok("Git remote configured");
} catch {
  err("No git remote 'origin' found");
  process.exit(1);
}

// ── 3. Bump version + commit + tag + push ───────────────────────────────────
hdr("3. Bump version + commit + tag + push");

// Update tauri.conf.json
// T-P2: previously JSON.stringify(..., 2) would reformat the file if the
// original used a different indent. We detect the indent from the first
// indented line so the diff stays minimal. tauri.conf.json is canonical
// 2-space JSON today, but this keeps the script robust if the indent
// ever changes.
const tauriConfPath = resolve(ROOT, "src-tauri", "tauri.conf.json");
const tauriConfRaw = readFileSync(tauriConfPath, "utf-8");
const tauriConf = JSON.parse(tauriConfRaw);
tauriConf.version = version;
// Detect indent: count leading spaces on the first non-blank line that
// starts with `"` (a key). Default to 2 if detection fails. The indent can
// be a number (spaces) or "\t" (tab) — JSON.stringify's third arg accepts
// both.
let tauriIndent: number | string = 2;
const indentMatch = tauriConfRaw.match(/^([ \t]+)"/m);
if (indentMatch && indentMatch[1]) {
  tauriIndent = indentMatch[1].includes("\t") ? "\t" : indentMatch[1].length;
}
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, tauriIndent) + "\n");

// PROD-005: also update Cargo.toml (was missing — stuck at 3.0.0)
const cargoTomlPath = resolve(ROOT, "src-tauri", "Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf-8");
const updatedCargo = cargoToml.replace(/^version = "[^"]*"/m, `version = "${version}"`);
writeFileSync(cargoTomlPath, updatedCargo);

// Update package.json
const pkgPath = resolve(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

ok(`Bumped version to ${version} in tauri.conf.json + package.json + Cargo.toml`);

// Commit
try {
  execSync(`git add -A`, { stdio: "pipe", cwd: ROOT });
  execSync(`git commit -m "release: v${version}"`, { stdio: "pipe", cwd: ROOT });
  ok("Committed");
} catch {
  warn("Nothing to commit (or commit failed — continuing)");
}

// Push to main
try {
  execSync("git push origin main", { stdio: "pipe", cwd: ROOT });
  ok("Pushed to main");
} catch {
  err("Failed to push to main");
  process.exit(1);
}

// Create + push tag
const tagName = `v${version}`;
try {
  try { execSync(`git tag -d ${tagName}`, { stdio: "pipe", cwd: ROOT }); } catch {}
  execSync(`git tag ${tagName}`, { stdio: "pipe", cwd: ROOT });
  execSync(`git push origin ${tagName}`, { stdio: "pipe", cwd: ROOT });
  ok(`Tagged ${tagName} + pushed`);
} catch {
  err(`Failed to create/push tag ${tagName}`);
  process.exit(1);
}

// ── 4. Build the installer ──────────────────────────────────────────────────
hdr("4. Building installer (5-15 min)");

const privateKey = readFileSync(PRIVATE_KEY_PATH, "utf-8").trim();
const buildEnv = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: privateKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  NODE_OPTIONS: "--max-old-space-size=4096",
};

try {
  execSync("bunx tauri build", {
    stdio: "inherit",
    cwd: ROOT,
    env: buildEnv,
  });
  ok("Installer built + signed");
} catch {
  err("Tauri build failed");
  process.exit(1);
}

// ── 5. Find built artifacts ─────────────────────────────────────────────────
hdr("5. Collecting artifacts");

const BUNDLE_DIR = resolve(ROOT, "src-tauri", "target", "release", "bundle");
if (!existsSync(BUNDLE_DIR)) {
  err(`Bundle directory not found: ${BUNDLE_DIR}`);
  process.exit(1);
}

interface Artifact { path: string; name: string; sigPath?: string; sig?: string; }
const artifacts: Artifact[] = [];

function findArtifacts(dir: string) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findArtifacts(fullPath);
    } else if (entry.name.match(/\.(msi|dmg|AppImage|exe)$/i) && !entry.name.endsWith(".sig")) {
      const sigPath = fullPath + ".sig";
      const sig = existsSync(sigPath) ? readFileSync(sigPath, "utf-8").trim() : undefined;
      artifacts.push({ path: fullPath, name: entry.name, sigPath: existsSync(sigPath) ? sigPath : undefined, sig });
      console.log(`  📦 ${entry.name} ${sig ? "(signed)" : "(no signature)"}`);
    }
  }
}
findArtifacts(BUNDLE_DIR);

if (artifacts.length === 0) {
  err("No installer files found");
  process.exit(1);
}
ok(`Found ${artifacts.length} artifact(s)`);

// ── 6. Generate latest.json manifest ────────────────────────────────────────
hdr("6. Generate latest.json manifest");

const REPO = "rendowblock-jpg/sahelflow_v2";
const baseUrl = `https://github.com/${REPO}/releases/download/${tagName}`;

// Determine platform for each artifact
function getPlatform(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".msi") || lower.endsWith("_setup.exe")) return "windows-x86_64";
  if (lower.includes("aarch64") && lower.endsWith(".dmg")) return "darwin-aarch64";
  if (lower.includes("x86_64") && lower.endsWith(".dmg")) return "darwin-x86_64";
  if (lower.endsWith(".appimage")) return "linux-x86_64";
  return null;
}

const platforms: Record<string, { signature: string; url: string; }> = {};
for (const art of artifacts) {
  const platform = getPlatform(art.name);
  if (platform && art.sig) {
    platforms[platform] = {
      signature: art.sig,
      url: `${baseUrl}/${art.name}`,
    };
  }
}

const manifest = {
  version,
  notes: notesArg,
  pub_date: new Date().toISOString(),
  platforms,
};

const manifestPath = resolve(ROOT, "src-tauri", "target", "release", "latest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
ok("latest.json generated");
console.log(JSON.stringify(manifest, null, 2));

// ── 7. Create GitHub Release + upload files ─────────────────────────────────
hdr("7. Create GitHub Release + upload");

// Check if release already exists
let releaseId: string | null = null;
try {
  const result = spawnSync("curl", [
    "-s", "-H", `Authorization: token ${githubPat}`,
    "https://api.github.com/repos/" + REPO + "/releases/tags/" + tagName,
  ], { encoding: "utf-8" });
  const data = JSON.parse(result.stdout || "{}");
  if (data.id) {
    releaseId = data.id;
    warn(`Release ${tagName} already exists (ID: ${releaseId}) — uploading new assets`);
  }
} catch {}

// Create release if it doesn't exist
if (!releaseId) {
  const releaseBody = JSON.stringify({
    tag_name: tagName,
    name: `SahelFlow ${version}`,
    body: notesArg,
    draft: false,
    prerelease: false,
  });

  const result = spawnSync("curl", [
    "-s", "-X", "POST",
    "-H", `Authorization: token ${githubPat}`,
    "-H", "Content-Type: application/json",
    "-d", releaseBody,
    "https://api.github.com/repos/" + REPO + "/releases",
  ], { encoding: "utf-8" });

  const data = JSON.parse(result.stdout || "{}");
  if (data.id) {
    releaseId = data.id;
    ok(`Release created (ID: ${releaseId})`);
  } else {
    err("Failed to create release: " + (data.message || "unknown error"));
    process.exit(1);
  }
}

// Upload all artifacts + latest.json
const uploadUrl = `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets`;

async function uploadAsset(filePath: string, fileName: string) {
  const result = spawnSync("curl", [
    "-s", "-X", "POST",
    "-H", `Authorization: token ${githubPat}`,
    "-H", "Content-Type: application/octet-stream",
    "--data-binary", `@${filePath}`,
    `${uploadUrl}?name=${encodeURIComponent(fileName)}`,
  ], { encoding: "utf-8" });

  const data = JSON.parse(result.stdout || "{}");
  if (data.browser_download_url) {
    ok(`Uploaded: ${fileName}`);
  } else {
    warn(`Upload may have failed for ${fileName}: ${data.message || "unknown"}`);
  }
}

// Upload installer files
for (const art of artifacts) {
  await uploadAsset(art.path, art.name);
  if (art.sigPath) {
    await uploadAsset(art.sigPath, art.name + ".sig");
  }
}

// Upload latest.json
await uploadAsset(manifestPath, "latest.json");

// ── Done ────────────────────────────────────────────────────────────────────
hdr("Release complete!");
console.log(`
${GREEN}✅ Released v${version}${NC}

${BOLD}Download:${NC} https://github.com/${REPO}/releases/tag/${tagName}

${BOLD}Updater manifest:${NC} https://github.com/${REPO}/releases/latest/download/latest.json

${BOLD}What happens now:${NC}
- Installed apps check for updates on next launch
- They see v${version} > their version → download → verify signature → install → relaunch
- New users can download the installer from the release page

${BOLD}To release the next version:${NC}
  bun run release
`);
