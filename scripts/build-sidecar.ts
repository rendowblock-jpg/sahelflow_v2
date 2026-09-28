/**
 * build-sidecar — compile the desktop sidecars into standalone binaries.
 *
 * Tauri's `externalBin` config requires each binary to exist at:
 *   src-tauri/binaries/sahelflow-whatsapp-<target-triple>[.exe]
 *   src-tauri/binaries/sahelflow-mcp-<target-triple>[.exe]   (FD-063 MCP-11b)
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
const SIDECAR_DIR = resolve(ROOT, "src-tauri", "binaries");
const PINNED_BUN_COMPILER = resolve(
  ROOT,
  ".sf-build",
  "tools",
  "bun-windows-x64-baseline.exe",
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
const compileTarget = isWindows && triple === "x86_64-pc-windows-msvc"
  ? "--target=bun-windows-x64-baseline "
  : "";
const compileExecutable = compileTarget
  ? `--compile-executable-path="${PINNED_BUN_COMPILER}" `
  : "";

// ── 3. Cache check — skip rebuild if source unchanged ──────────────────────
import { statSync } from "fs";

mkdirSync(SIDECAR_DIR, { recursive: true });

function newestMtime(paths: string[]): number {
  let newest = 0;
  function walkDir(dir: string): void {
    try {
      const entries = require("fs").readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = resolve(dir, entry.name);
        const st = statSync(full);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walkDir(full);
        } else if (st.mtimeMs > newest) {
          newest = st.mtimeMs;
        }
      }
    } catch { /* ignore */ }
  }
  for (const d of paths) {
    try {
      const st = statSync(d);
      if (st.isDirectory()) walkDir(d);
      else if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch { /* ignore */ }
  }
  return newest;
}

const FORCE = process.env.SF_FORCE_SIDECAR === "1" || process.argv.includes("--force");

interface SidecarBuild {
  label: string;
  name: string;
  source: string;
  sourceDirs: string[];
  externals: string;
}

// Compare source mtime vs binary mtime. Skip the rebuild if the source
// hasn't changed since the last build.
function compileSidecar(build: SidecarBuild): void {
  const fileName = `${build.name}-${triple}${isWindows ? ".exe" : ""}`;
  const output = resolve(SIDECAR_DIR, fileName);
  if (!existsSync(resolve(ROOT, build.source))) {
    console.error(`❌ Sidecar source not found: ${build.source}`);
    process.exit(1);
  }
  if (!FORCE && existsSync(output) && statSync(output).mtimeMs >= newestMtime(build.sourceDirs)) {
    console.log(`✅ ${build.label} binary up-to-date (cached) → src-tauri/binaries/${fileName}`);
    console.log("   (skipped rebuild — source unchanged. Run with SF_FORCE_SIDECAR=1 to force.)");
    return;
  }
  if (compileTarget && !existsSync(PINNED_BUN_COMPILER)) {
    throw new Error(
      `Pinned build-only Bun compiler is missing at ${PINNED_BUN_COMPILER}; run bun run scripts/prepare-runtime.ts first`,
    );
  }
  console.log(`── Compiling ${build.label} → ${fileName} ──`);
  try {
    execSync(
      "bun build --compile " +
      compileTarget +
      compileExecutable +
      "--conditions=module-sync " +
      build.externals +
      `${build.source} --outfile "${output}"`,
      { stdio: "inherit", cwd: ROOT }
    );
    console.log(`✅ ${build.label} compiled → src-tauri/binaries/${fileName}`);
  } catch (err) {
    console.error(`❌ ${build.label} compilation failed.`);
    console.error("   The externalBin is required for both tauri dev and tauri build.");
    console.error("   Fix the compilation error above and re-run.");
    process.exit(1);
  }
}

compileSidecar({
  label: "WhatsApp sidecar",
  name: "sahelflow-whatsapp",
  source: "sidecars/whatsapp/index.ts",
  sourceDirs: [resolve(ROOT, "sidecars/whatsapp"), resolve(ROOT, "package.json")],
  externals:
    "--external jimp --external link-preview-js --external sharp " +
    "--external qrcode-terminal --external pino-pretty " +
    "--external fluent-ffmpeg ",
});

// FD-063 MCP-11b: the stdio bridge an MCP client (Claude Desktop, …) launches.
// It has no dependencies beyond the Bun/Node standard library.
compileSidecar({
  label: "MCP bridge",
  name: "sahelflow-mcp",
  source: "sidecars/mcp/index.ts",
  sourceDirs: [resolve(ROOT, "sidecars/mcp"), resolve(ROOT, "package.json")],
  externals: "",
});
