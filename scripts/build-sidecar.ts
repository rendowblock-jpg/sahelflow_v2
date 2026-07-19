/**
 * build-sidecar — compile the WhatsApp sidecar into a standalone binary.
 *
 * Tauri's `externalBin` config requires the binary to exist at:
 *   src-tauri/binaries/sahelflow-whatsapp-<target-triple>[.exe]
 *
 * This script detects the target triple (from rustc or platform detection),
 * compiles the sidecar with `bun build --compile`, and outputs it to the
 * correct path. Run before `tauri dev` and `tauri build`.
 *
 * Usage: bun run build:sidecar
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();
const SIDECAR_SRC = resolve(ROOT, "sidecars/whatsapp/index.ts");
const SIDECAR_DIR = resolve(ROOT, "src-tauri", "binaries");
const PINNED_BUN_COMPILER = resolve(
  ROOT,
  "src-tauri",
  "resources",
  "runtime",
  "bun.exe",
);

// ── 1. Detect the target triple ──────────────────────────────────────────────
// Tauri names externalBin as <name>-<target-triple>[.exe]
// e.g. sahelflow-whatsapp-x86_64-pc-windows-msvc.exe
let triple = "";
try {
  const rustInfo = execSync("rustc -vV", { stdio: "pipe" }).toString();
  const match = rustInfo.match(/^host:\s*(.+)$/m);
  triple = match && match[1] ? match[1].trim() : "";
} catch {
  // rustc not available — detect from platform
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") triple = "x86_64-pc-windows-msvc";
  else if (platform === "darwin") triple = arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  else if (platform === "linux") triple = arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
}

if (!triple) {
  console.error("❌ Could not detect target triple. Install Rust or set it manually.");
  process.exit(1);
}

const isWindows = process.platform === "win32";
const sidecarName = `sahelflow-whatsapp-${triple}${isWindows ? ".exe" : ""}`;
const sidecarOut = resolve(SIDECAR_DIR, sidecarName);
const compileTarget = isWindows && triple === "x86_64-pc-windows-msvc"
  ? "--target=bun-windows-x64-baseline "
  : "";
const compileExecutable = isWindows && existsSync(PINNED_BUN_COMPILER)
  ? `--compile-executable-path="${PINNED_BUN_COMPILER}" `
  : "";

// ── 2. Check if the source exists ────────────────────────────────────────────
if (!existsSync(SIDECAR_SRC)) {
  console.error(`❌ Sidecar source not found: ${SIDECAR_SRC}`);
  process.exit(1);
}

// ── 3. Cache check — skip rebuild if source unchanged ──────────────────────
import { statSync } from "fs";

mkdirSync(SIDECAR_DIR, { recursive: true });

// Compare source mtime vs binary mtime. Skip the 70s rebuild if source
// hasn't changed since the last build.
const SRC_DIRS = [
  resolve(ROOT, "sidecars/whatsapp"),
  resolve(ROOT, "package.json"),
];
let newestSrcMtime = 0;
function walkDir(dir: string): void {
  try {
    const entries = require("fs").readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      const st = statSync(full);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walkDir(full);
      } else if (st.mtimeMs > newestSrcMtime) {
        newestSrcMtime = st.mtimeMs;
      }
    }
  } catch { /* ignore */ }
}
for (const d of SRC_DIRS) {
  try {
    const st = statSync(d);
    if (st.isDirectory()) walkDir(d);
    else if (st.mtimeMs > newestSrcMtime) newestSrcMtime = st.mtimeMs;
  } catch { /* ignore */ }
}

const FORCE = process.env.SF_FORCE_SIDECAR === "1" || process.argv.includes("--force");
let skipBuild = false;
if (!FORCE && existsSync(sidecarOut)) {
  const binaryMtime = statSync(sidecarOut).mtimeMs;
  if (binaryMtime >= newestSrcMtime) {
    skipBuild = true;
  }
}

if (skipBuild) {
  console.log(`✅ Sidecar binary up-to-date (cached) → src-tauri/binaries/${sidecarName}`);
  console.log("   (skipped 70s rebuild — source unchanged. Run with SF_FORCE_SIDECAR=1 to force.)");
} else {
  console.log(`── Compiling WhatsApp sidecar → ${sidecarName} ──`);
  try {
    execSync(
      "bun build --compile " +
      compileTarget +
      compileExecutable +
      "--conditions=module-sync " +
      "--external jimp --external link-preview-js --external sharp " +
      "--external qrcode-terminal --external pino-pretty " +
      "--external fluent-ffmpeg " +
      `sidecars/whatsapp/index.ts --outfile "${sidecarOut}"`,
      { stdio: "inherit", cwd: ROOT }
    );
    console.log(`✅ Sidecar compiled → src-tauri/binaries/${sidecarName}`);
  } catch (err) {
    console.error("❌ Sidecar compilation failed.");
    console.error("   The externalBin is required for both tauri dev and tauri build.");
    console.error("   Fix the compilation error above and re-run.");
    process.exit(1);
  }
}
