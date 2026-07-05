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

// ── 2. Check if the source exists ────────────────────────────────────────────
if (!existsSync(SIDECAR_SRC)) {
  console.error(`❌ Sidecar source not found: ${SIDECAR_SRC}`);
  process.exit(1);
}

// ── 3. Compile ───────────────────────────────────────────────────────────────
mkdirSync(SIDECAR_DIR, { recursive: true });

console.log(`── Compiling WhatsApp sidecar → ${sidecarName} ──`);

try {
  execSync(
    "bun build --compile " +
    "--external jimp --external link-preview-js --external sharp " +
    "--external qrcode-terminal --external pino-pretty --external music-metadata " +
    "--external fluent-ffmpeg --external libphonenumber-js " +
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
