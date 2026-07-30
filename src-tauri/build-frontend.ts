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

import { execFileSync, execSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { resolve } from "path";
import { prepareDesktopBuildContext } from "../scripts/desktop-build-context";
import { writeStandaloneManifest } from "../scripts/standalone-manifest";

const ROOT = process.cwd();
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const NC = "\x1b[0m";
const PINNED_BUN_VERSION = "1.3.14";
const RUNTIME_BOOTSTRAP_MARKER = "// SahelFlow desktop runtime bootstrap";
const APP_VERSION = (
  JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    version?: unknown;
  }
).version;
if (typeof APP_VERSION !== "string") {
  throw new Error("package.json version is missing during desktop build");
}

function ok(msg: string) { console.log(`${GREEN}✅ ${msg}${NC}`); }
function step(msg: string) { console.log(`${YELLOW}── ${msg} ──${NC}`); }

function hardenStandaloneServer(source: string): string {
  if (source.includes(RUNTIME_BOOTSTRAP_MARKER)) return source;

  let insertionOffset = 0;
  if (source.startsWith("#!")) {
    const lineEnd = source.indexOf("\n");
    if (lineEnd < 0) {
      throw new Error("Standalone server contains an invalid unterminated shebang");
    }
    insertionOffset = lineEnd + 1;
  }

  const afterShebang = source.slice(insertionOffset);
  const strictDirective = /^(?:["']use strict["'];?\r?\n)/.exec(afterShebang);
  if (strictDirective) insertionOffset += strictDirective[0].length;

  const bootstrap = `${RUNTIME_BOOTSTRAP_MARKER}\nprocess.env.NEXT_TELEMETRY_DISABLED ??= "1";\n`;
  return `${source.slice(0, insertionOffset)}${bootstrap}${source.slice(insertionOffset)}`;
}

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

// The installed desktop intentionally gives the mandatory server a tiny,
// deterministic environment with no user-profile variables. Next telemetry
// otherwise tries to discover profile state that is irrelevant to this local
// application server and differs from the direct packaged-runtime smoke. Make
// the standalone artifact self-contained instead of weakening the launcher
// environment boundary. Preserve any shebang and strict-mode directive prologue.
const standaloneServer = resolve(standaloneDir, "server.js");
if (!existsSync(standaloneServer)) {
  throw new Error(`Standalone server entry is missing: ${standaloneServer}`);
}
const serverSource = readFileSync(standaloneServer, "utf8");
writeFileSync(standaloneServer, hardenStandaloneServer(serverSource), "utf8");
ok("Hardened standalone runtime bootstrap");

const rotationWorker = resolve(standaloneDir, "sahelflow-rotate-master-key.cjs");
execFileSync(
  process.execPath,
  [
    "build",
    "scripts/rotate-master-key.ts",
    "--target=node",
    // This is a separate installed entrypoint, so Next's standalone tracer has
    // not proven that its package imports are present. Bundle the worker's
    // ordinary JavaScript dependencies and leave only Prisma external: Prisma
    // must resolve its generated client beside the exact packaged native
    // engine selected by PRISMA_QUERY_ENGINE_LIBRARY at runtime.
    "--external=@prisma/client",
    "--conditions=react-server",
    `--outfile=${rotationWorker}`,
  ],
  { stdio: "inherit", cwd: ROOT },
);
if (!existsSync(rotationWorker)) {
  throw new Error(`Protected rotation worker is missing: ${rotationWorker}`);
}
ok("Bundled protected installation-root rotation worker");

const standaloneManifest = writeStandaloneManifest(standaloneDir, APP_VERSION);
ok(
  `Standalone manifest: ${standaloneManifest.fileCount} files; ${standaloneManifest.treeSha256}`,
);

// ── 3. Copy standalone → src-tauri/resources/standalone ─────────────────────
step("3. Copy standalone → src-tauri/resources/standalone");
const resDir = resolve(ROOT, "src-tauri", "resources", "standalone");
const placeholderPath = resolve(resDir, ".gitkeep");
if (!existsSync(placeholderPath)) {
  throw new Error(`Tracked standalone placeholder is missing before build: ${placeholderPath}`);
}
const placeholderBytes = readFileSync(placeholderPath);
if (existsSync(resDir)) {
  rmSync(resDir, { recursive: true, force: true });
}
mkdirSync(resDir, { recursive: true });
cpSync(standaloneDir, resDir, { recursive: true });
// Restore the exact existing working-tree bytes, including its current checkout
// line endings, so replacing generated resources never dirties the placeholder.
writeFileSync(placeholderPath, placeholderBytes);
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
