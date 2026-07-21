/**
 * SahelFlow — Tauri production frontend build (cross-platform)
 *
 * Run by Tauri's `beforeBuildCommand`. Produces:
 *   1. Next.js standalone server (.next/standalone/) + arranges static assets
 *   2. Resources bundle (src-tauri/resources/standalone/) for Tauri to package
 *   3. Compiled WhatsApp sidecar binary (src-tauri/binaries/sahelflow-whatsapp-<triple>)
 *
 * Cross-platform: works on Windows, macOS, and Linux (uses Bun, not bash).
 */

import { execSync } from "child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { prepareDesktopBuildContext } from "../scripts/desktop-build-context";

const ROOT = process.cwd();
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const NC = "\x1b[0m";
const PINNED_BUN_VERSION = "1.3.14";

function ok(msg: string) { console.log(`${GREEN}✅ ${msg}${NC}`); }
function step(msg: string) { console.log(`${YELLOW}── ${msg} ──${NC}`); }

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The SahelFlow internal candidate build supports Windows x64 only");
}
if (process.versions.bun !== PINNED_BUN_VERSION) {
  throw new Error(
    `Build Bun must be ${PINNED_BUN_VERSION}, found ${process.versions.bun ?? "not Bun"}`,
  );
}

// The installed candidate must never depend on a developer PATH runtime.
step("0. Prepare pinned Windows runtime");
execSync("bun run scripts/prepare-runtime.ts", {
  stdio: "inherit",
  cwd: ROOT,
});
ok("Pinned runtime prepared");

// ── 1. Next.js standalone build ──────────────────────────────────────────────
step("1. Next.js standalone build");
// The canonical package build explicitly selects Webpack. Next.js imports
// server route modules while collecting build metadata, so provide a complete,
// disposable ShopContext that lives below the OS temporary directory. The
// installed server receives its real authority tuple from Tauri at runtime.
const buildContext = prepareDesktopBuildContext();
try {
  execSync("bun run build", {
    stdio: "inherit",
    cwd: ROOT,
    env: {
      ...process.env,
      ...buildContext.env,
      NODE_OPTIONS: "--max-old-space-size=4096",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
} finally {
  buildContext.cleanup();
}
ok("Next.js build complete");

// ── 2. Arrange static + public into standalone ──────────────────────────────
step("2. Arrange static + public into standalone");
const standaloneDir = resolve(ROOT, ".next", "standalone");
const staticDir = resolve(ROOT, ".next", "static");
const publicDir = resolve(ROOT, "public");

if (!existsSync(standaloneDir)) {
  console.error("❌ .next/standalone not found. Build may have failed.");
  process.exit(1);
}

// Copy .next/static → .next/standalone/.next/static
if (existsSync(staticDir)) {
  const standaloneStaticDir = resolve(standaloneDir, ".next", "static");
  mkdirSync(resolve(standaloneDir, ".next"), { recursive: true });
  cpSync(staticDir, standaloneStaticDir, { recursive: true });
  ok("Copied .next/static → standalone");
}

// Copy public/ → .next/standalone/public/
if (existsSync(publicDir)) {
  const standalonePublicDir = resolve(standaloneDir, "public");
  cpSync(publicDir, standalonePublicDir, { recursive: true });
  ok("Copied public → standalone");
}

// ── 3. Copy standalone → src-tauri/resources/standalone ─────────────────────
step("3. Copy standalone → src-tauri/resources/standalone");
const resDir = resolve(ROOT, "src-tauri", "resources", "standalone");
if (existsSync(resDir)) {
  rmSync(resDir, { recursive: true, force: true });
}
mkdirSync(resDir, { recursive: true });
cpSync(standaloneDir, resDir, { recursive: true });
// The directory is ignored except for this tracked placeholder. Recreate it
// after replacing the generated resource tree so the build never deletes a
// tracked source file.
writeFileSync(resolve(resDir, ".gitkeep"), "", "utf8");
ok("Copied standalone → src-tauri/resources/standalone");

// ── 4. Compile WhatsApp sidecar (Bun → standalone binary) ───────────────────
step("4. Compile WhatsApp sidecar");
try {
  execSync("bun run build:sidecar", { stdio: "inherit", cwd: ROOT });
  ok("Sidecar compiled");
} catch (err) {
  console.error("❌ Sidecar compilation failed — Tauri build cannot proceed.");
  console.error("   The externalBin is required for the production bundle.");
  console.error("   Fix the compilation error above and re-run.");
  process.exit(1);
}

ok("Frontend build complete");
