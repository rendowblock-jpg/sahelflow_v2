/**
 * SahelFlow — Runtime bundling preparer (T-S5).
 *
 * Downloads the platform Bun binary + Prisma query-engine binary into
 * `src-tauri/resources/runtime/` so they get packaged into the installer
 * by `tauri.conf.json` → `bundle.resources` → `resources/runtime/ (recursive glob)`.
 *
 * WHY: end users (Algerian COD sellers) do NOT have Bun or Node installed.
 * Without bundling, `tauri build` produces an installer that shows a BLANK
 * window because lib.rs can't spawn the Next.js server. (T-S5 ship-blocker.)
 *
 * Run this ONCE on the founder's build machine before `bun run tauri:build`:
 *   bun run scripts/prepare-runtime.ts
 *
 * It is idempotent (skips files already present) and platform-aware
 * (downloads the Bun + Prisma binaries matching the host triple).
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bunExe, platformTargetTriple, prismaEngineName } from "./runtime-platform";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const RUNTIME_DIR = join(ROOT, "src-tauri", "resources", "runtime");

function step(msg: string) { console.log(`── ${msg} ──`); }
function ok(msg: string) { console.log(`✅ ${msg}`); }

async function download(url: string, dest: string): Promise<void> {
  // Use curl (available on macOS/Linux/Windows 10+) with retries.
  execSync(`curl -L --fail --retry 3 --connect-timeout 30 -o "${dest}" "${url}"`, {
    stdio: "inherit",
  });
}

async function main() {
  const triple = platformTargetTriple();
  console.log(`\nSahelFlow runtime bundling — target: ${triple}\n`);

  if (!existsSync(RUNTIME_DIR)) mkdirSync(RUNTIME_DIR, { recursive: true });

  // ── 1. Bun runtime ──────────────────────────────────────────────────────
  step("1. Bun runtime");
  const bunDest = join(RUNTIME_DIR, bunExe());
  if (existsSync(bunDest)) {
    ok(`Bun already present at ${bunDest} (skipping)`);
  } else {
    // Resolve the latest Bun release URL for this platform.
    const bunVersion = process.env.BUN_VERSION ?? "1.3.14";
    const asset = `bun-${triple}.zip`;
    const url = `https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${asset}`;
    const tmpZip = join(RUNTIME_DIR, "bun.zip");
    console.log(`   downloading ${url}`);
    await download(url, tmpZip);
    execSync(`unzip -o "${tmpZip}" -d "${RUNTIME_DIR}"`, { stdio: "inherit" });
    // The zip extracts bun-<triple>/bun — move it to runtime/bun[.exe]
    const extracted = join(RUNTIME_DIR, `bun-${triple}`, bunExe());
    if (existsSync(extracted)) {
      renameSync(extracted, bunDest);
      rmSync(join(RUNTIME_DIR, `bun-${triple}`), { recursive: true, force: true });
    }
    rmSync(tmpZip, { force: true });
    if (!existsSync(bunDest)) {
      throw new Error(`Bun binary not found at ${bunDest} after extraction`);
    }
    execSync(`chmod +x "${bunDest}"`, { stdio: "ignore" });
    ok(`Bun installed at ${bunDest}`);
  }

  // ── 2. Prisma query engine ──────────────────────────────────────────────
  step("2. Prisma query engine");
  const engineDest = join(RUNTIME_DIR, prismaEngineName());
  if (existsSync(engineDest)) {
    ok(`Prisma engine already present at ${engineDest} (skipping)`);
  } else {
    // Read the Prisma version from node_modules to fetch the matching engine.
    let prismaVersion = process.env.PRISMA_VERSION;
    if (!prismaVersion) {
      try {
        const pkg = JSON.parse(
          execSync("cat node_modules/.bun/prisma@*/node_modules/prisma/package.json 2>/dev/null || cat node_modules/prisma/package.json", { encoding: "utf-8" })
        );
        prismaVersion = pkg.version;
      } catch {
        prismaVersion = "6.19.3";
      }
    }
    const engineUrl = `https://binaries.prisma.sh/all_commits/${prismaVersion}/${triple}/${prismaEngineName()}`;
    console.log(`   downloading ${engineUrl}`);
    await download(engineUrl, engineDest);
    execSync(`chmod +x "${engineDest}"`, { stdio: "ignore" });
    ok(`Prisma engine installed at ${engineDest}`);
  }

  console.log(`\n✅ Runtime ready in ${RUNTIME_DIR}\n`);
  console.log("   Next: bun run tauri:build  (Tauri packages runtime/ into the installer)\n");
}

main().catch((err) => {
  console.error("\n❌ Runtime preparation failed:", err);
  process.exit(1);
});
