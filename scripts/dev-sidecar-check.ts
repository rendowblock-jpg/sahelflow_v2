#!/usr/bin/env bun
/**
 * dev-sidecar-check — T-M5 dev-workflow guard.
 *
 * In `tauri dev` mode, `src-tauri/src/lib.rs` skips `spawn_services`
 * (cfg!(debug_assertions) gate) so the WhatsApp sidecar is NOT auto-started.
 * The dev must run `bun run sidecar` in a separate terminal. Without this
 * guard, the dev sees an empty inbox in tauri:dev with no explanation.
 *
 * This script probes port 3001 (the sidecar's default port) and prints a
 * clear warning if the sidecar isn't running. It never fails the build —
 * it's a nudge, not a gate.
 *
 * Wired into package.json: `tauri:dev` runs this between build:sidecar and
 * `bunx tauri dev`.
 */
import { createConnection } from "net";

const PORT = Number(process.env.SIDECAR_PORT ?? 3001);
const HOST = "127.0.0.1";

const YELLOW = "\x1b[0;33m";
const GREEN = "\x1b[0;32m";
const NC = "\x1b[0m";

function isPortOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 400);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  const up = await isPortOpen(PORT, HOST);
  if (up) {
    console.log(`${GREEN}✅ WhatsApp sidecar already running on ${HOST}:${PORT}${NC}`);
    return;
  }
  console.warn(
    `${YELLOW}⚠️  WhatsApp sidecar not detected on ${HOST}:${PORT}.` +
    `\n   tauri:dev does NOT auto-start the sidecar (lib.rs skips spawn_services in debug builds).` +
    `\n   Run \`bun run sidecar\` in a separate terminal to enable the inbox.` +
    `${NC}`,
  );
}

main().catch(() => {
  // Never fail the dev script on a guard check.
});
