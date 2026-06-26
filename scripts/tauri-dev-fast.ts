/**
 * SahelFlow — Fast Tauri dev mode (cross-platform)
 *
 * Pre-builds the frontend (next build) then runs the production server (next start)
 * inside the Tauri webview. This gives:
 *   ✅ Desktop app experience (Tauri window, not browser)
 *   ✅ Instant page loads (production build, no Turbopack on-demand compilation)
 *   ✅ Rust hot reload (Tauri dev mode)
 *   ❌ No frontend HMR (changes require re-running this script)
 *
 * Cross-platform: works on Windows, macOS, and Linux (uses Bun, not bash).
 *
 * Usage: bun run tauri:dev:fast
 */

import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();
const NEXT_BUILD_DIR = resolve(ROOT, ".next");
const BUILD_COMPLETE_FLAG = resolve(NEXT_BUILD_DIR, "BUILD_COMPLETE");

const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

function log(msg: string) { console.log(msg); }
function ok(msg: string) { console.log(`${GREEN}✅ ${msg}${NC}`); }
function warn(msg: string) { console.log(`${YELLOW}${msg}${NC}`); }
function hdr(msg: string) { console.log(`\n${YELLOW}── ${msg} ──${NC}`); }

log(`${BOLD}═══════════════════════════════════════════════════`);
log(`  SahelFlow — Fast Tauri Dev`);
log(`═══════════════════════════════════════════════════${NC}`);

// ── Step 1: Build the frontend (skip if already built) ──────────────────────
const needsBuild = !existsSync(BUILD_COMPLETE_FLAG);

if (needsBuild) {
  hdr("1. Building frontend (one-time, ~30-60s)");
  try {
    execSync("bun run build", { stdio: "inherit", cwd: ROOT });
    if (!existsSync(NEXT_BUILD_DIR)) mkdirSync(NEXT_BUILD_DIR, { recursive: true });
    writeFileSync(BUILD_COMPLETE_FLAG, new Date().toISOString());
    ok("Frontend built");
  } catch (err) {
    console.error("❌ Frontend build failed:", err);
    process.exit(1);
  }
} else {
  ok("Frontend already built (force rebuild with: rm -rf .next)");
}

// ── Step 2: Start the production server ─────────────────────────────────────
hdr("2. Starting production server (port 3000)");

// Kill any existing process on port 3000 (cross-platform)
try {
  if (process.platform === "win32") {
    execSync('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :3000 ^| findstr LISTENING\') do taskkill /F /PID %a', { stdio: "ignore", shell: "cmd.exe" });
  } else {
    execSync("lsof -ti:3000 | xargs kill -9 2>/dev/null || true", { stdio: "ignore", shell: "/bin/bash" });
  }
} catch {
  // Ignore errors — port might not be in use
}

const server = spawn("bun", ["run", "start"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});

// Wait for the server to be ready (cross-platform — uses fetch, not curl)
warn("   Waiting for server...");
let serverReady = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const response = await fetch("http://localhost:3000");
    if (response.ok || response.status > 0) {
      ok("Server ready");
      serverReady = true;
      break;
    }
  } catch {
    // Server not ready yet, continue waiting
  }
}

if (!serverReady) {
  warn("⚠️  Server didn't respond in 30s, continuing anyway — it may still be starting");
}

// ── Step 3: Run Tauri dev (skip beforeDevCommand since server is running) ───
hdr("3. Opening Tauri desktop window");
ok("Desktop app opening... (first Rust compile may take 2-5 min)");
warn("   Subsequent runs are faster (Rust cached)");

const tauri = spawn("bunx", ["tauri", "dev", "--no-before-dev"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});

// Cleanup on exit
function cleanup() {
  try { server.kill(); } catch {}
  try { tauri.kill(); } catch {}
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

tauri.on("exit", (code) => {
  log(`\nTauri exited with code ${code}`);
  cleanup();
});
