import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The packaged sidecar resolves its DPAPI-protected storage root through a
// synchronous powershell.exe. These tests stand in for that process (no Windows
// needed) so the number of spawns can be counted. They prove the root is
// unlocked once per process, not once per spool open and once per connect.
const dpapi = vi.hoisted(() => ({
  spawn: null as null | ((command: string, args: string[], options: { input: string }) => unknown),
  operations: [] as string[],
  failNextUnprotect: false,
}));

// What the module wrote to the diagnostics file, captured instead of written.
const logged = vi.hoisted(() => ({
  events: [] as Array<{ event: string; fields: unknown }>,
}));

vi.mock("./diagnostics-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./diagnostics-log")>();
  return {
    ...actual,
    diagnostics: {
      record(event: string, fields?: unknown) {
        logged.events.push({ event, fields });
      },
    },
  };
});

vi.mock("node:child_process", () => ({
  spawnSync: (command: string, args: string[], options: { input: string }) =>
    dpapi.spawn?.(command, args, options),
}));

const WORKSPACE_ID = "a1".repeat(16);
const INSTALLATION_ID = "b2".repeat(16);

let sandbox = "";
let windowsRoot = "";
const saved: Record<string, string | undefined> = {};
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

function fakePowerShell(_command: string, _args: string[], options: { input: string }): unknown {
  const payload = JSON.parse(options.input) as {
    operation: "protect" | "unprotect";
    workspaceId: string;
    installationId: string;
    dataBase64: string;
  };
  dpapi.operations.push(payload.operation);
  if (payload.operation === "unprotect" && dpapi.failNextUnprotect) {
    dpapi.failNextUnprotect = false;
    return { status: 1, stdout: "", stderr: "simulated DPAPI failure", error: undefined };
  }
  // A self-inverse stand-in for CurrentUser DPAPI bound to the installation.
  const mask = Buffer.from(`${payload.workspaceId}:${payload.installationId}`);
  const data = Buffer.from(payload.dataBase64, "base64");
  const out = Buffer.from(data.map((byte, index) => byte ^ (mask[index % mask.length] ?? 0)));
  return { status: 0, stdout: out.toString("base64"), stderr: "", error: undefined };
}

function spawnCount(): number {
  return dpapi.operations.length;
}

/** Every file under a directory, as text. */
function everythingOnDisk(directory: string): string {
  const parts: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) parts.push(everythingOnDisk(path));
    else parts.push(readFileSync(path, "utf8"));
  }
  return parts.join("\n");
}

async function loadStorage(): Promise<typeof import("./protected-storage-key")> {
  vi.resetModules();
  return import("./protected-storage-key");
}

function writeRegistry(installationId: string = INSTALLATION_ID): void {
  writeFileSync(
    join(sandbox, "shop-registry.json"),
    JSON.stringify({
      formatVersion: 2,
      revision: 1,
      workspaceId: WORKSPACE_ID,
      installationId,
      activeShopId: "shop-a",
      shops: [],
    }),
  );
}

beforeEach(() => {
  for (const name of [
    "SF_DATA_DIR",
    "NODE_ENV",
    "WINDIR",
    "SystemRoot",
    "SF_WHATSAPP_STORAGE_KEY",
  ]) {
    saved[name] = process.env[name];
  }
  sandbox = mkdtempSync(join(tmpdir(), "sahelflow-wa-dpapi-cache-"));
  windowsRoot = join(sandbox, "windows");
  const shellDirectory = join(windowsRoot, "System32", "WindowsPowerShell", "v1.0");
  mkdirSync(shellDirectory, { recursive: true });
  writeFileSync(join(shellDirectory, "powershell.exe"), "");
  writeRegistry();
  process.env.SF_DATA_DIR = sandbox;
  process.env.NODE_ENV = "production";
  process.env.WINDIR = windowsRoot;
  delete process.env.SystemRoot;
  delete process.env.SF_WHATSAPP_STORAGE_KEY;
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  dpapi.operations = [];
  dpapi.failNextUnprotect = false;
  dpapi.spawn = fakePowerShell;
  logged.events = [];
});

afterEach(() => {
  dpapi.spawn = null;
  if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.restoreAllMocks();
  rmSync(sandbox, { recursive: true, force: true });
});

describe("packaged WhatsApp storage key resolution", () => {
  it("unlocks the DPAPI authority once per process for the spool and every later connect", async () => {
    const storage = await loadStorage();

    const spoolKey = storage.getWhatsAppInboundSpoolStorageKey();
    const afterFirstUnlock = spawnCount();
    expect(afterFirstUnlock).toBeGreaterThan(0);

    const authKeys = [
      storage.getWhatsAppAuthStorageKey(),
      storage.getWhatsAppAuthStorageKey(),
      storage.getWhatsAppAuthStorageKey(),
    ];
    storage.getWhatsAppInboundSpoolStorageKey();

    expect(spawnCount()).toBe(afterFirstUnlock);
    expect(authKeys[0]?.equals(authKeys[1] ?? Buffer.alloc(0))).toBe(true);
    expect(authKeys[0]?.equals(spoolKey)).toBe(false);
    expect(spoolKey).toHaveLength(32);
  });

  it("opens the spool and every connect's auth state with a single DPAPI unlock between them", async () => {
    vi.resetModules();
    const { WhatsAppInboundSpool } = await import("./inbound-spool");
    const auth = await import("./protected-auth-state");

    // index.ts opens the spool at process start...
    const spool = new WhatsAppInboundSpool({
      directory: join(sandbox, "whatsapp-inbound-spool"),
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl: vi.fn() as unknown as typeof fetch,
      onCommitted: vi.fn(),
    });
    const afterSpoolOpen = spawnCount();
    expect(afterSpoolOpen).toBeGreaterThan(0);

    // ...and whatsapp.ts loads the auth state on the first connect and on every
    // reconnect. None of those may start powershell.exe again.
    await auth.useProtectedWhatsAppAuthState();
    await auth.useProtectedWhatsAppAuthState();
    await auth.useProtectedWhatsAppAuthState();

    expect(spawnCount()).toBe(afterSpoolOpen);
    expect(spool.pendingCount()).toBe(0);
  });

  it("still refuses another installation identity after the key was cached, and recovers when the canonical identity returns", async () => {
    // The same assertions as protected-storage-windows-smoke.ts (real DPAPI, CI
    // on Windows): a cache must not turn the authority's identity check off.
    const storage = await loadStorage();
    const original = storage.getWhatsAppAuthStorageKey();
    storage.getWhatsAppAuthStorageKey();

    writeRegistry("c3".repeat(16));
    expect(() => storage.getWhatsAppAuthStorageKey()).toThrow();
    expect(() => storage.getWhatsAppInboundSpoolStorageKey()).toThrow();

    writeRegistry();
    const recovered = storage.getWhatsAppAuthStorageKey();
    expect(recovered.equals(original)).toBe(true);
  });

  it("hands out independent copies: a caller that wipes its key cannot wipe the next caller's", async () => {
    const storage = await loadStorage();
    const first = storage.getWhatsAppAuthStorageKey();
    const snapshot = Buffer.from(first);

    first.fill(0);
    const second = storage.getWhatsAppAuthStorageKey();

    expect(second.equals(snapshot)).toBe(true);
    expect(second).not.toBe(first);
    expect(second.some((byte) => byte !== 0)).toBe(true);
  });

  it("returns the same keys after a restart (cache cleared) and unlocks again exactly then", async () => {
    const storage = await loadStorage();
    const auth = storage.getWhatsAppAuthStorageKey();
    const spool = storage.getWhatsAppInboundSpoolStorageKey();
    const before = spawnCount();

    storage.clearWhatsAppStorageKeyCache();
    const authAgain = storage.getWhatsAppAuthStorageKey();
    const spoolAgain = storage.getWhatsAppInboundSpoolStorageKey();

    expect(spawnCount()).toBeGreaterThan(before);
    expect(authAgain.equals(auth)).toBe(true);
    expect(spoolAgain.equals(spool)).toBe(true);
  });

  it("zeroes the cached keys when the cache is cleared", async () => {
    const storage = await loadStorage();
    const fill = vi.spyOn(Buffer.prototype, "fill");
    storage.getWhatsAppAuthStorageKey();
    fill.mockClear();

    storage.clearWhatsAppStorageKeyCache();

    const wiped = fill.mock.contexts.filter(
      (context): context is Buffer => Buffer.isBuffer(context) && context.length === 32,
    );
    expect(wiped.length).toBeGreaterThanOrEqual(2);
    for (const buffer of wiped) expect(buffer.every((byte) => byte === 0)).toBe(true);
  });

  it("clears the cache when the process exits", async () => {
    const once = vi.spyOn(process, "once");
    const storage = await loadStorage();
    storage.getWhatsAppAuthStorageKey();
    expect(once.mock.calls.some(([event]) => event === "exit")).toBe(true);
  });

  it("does not cache a failed unlock: the next call asks DPAPI again and succeeds", async () => {
    const storage = await loadStorage();
    const expected = storage.getWhatsAppAuthStorageKey();
    storage.clearWhatsAppStorageKeyCache();

    dpapi.failNextUnprotect = true;
    expect(() => storage.getWhatsAppAuthStorageKey()).toThrow(
      /Windows protected WhatsApp storage operation failed/,
    );
    const afterFailure = spawnCount();

    const recovered = storage.getWhatsAppAuthStorageKey();
    expect(spawnCount()).toBeGreaterThan(afterFailure);
    expect(recovered.equals(expected)).toBe(true);
  });

  it("writes the derived keys nowhere: not to disk, not to the diagnostics, and logs the unlock once as a duration only", async () => {
    const storage = await loadStorage();
    const keys = [
      storage.getWhatsAppAuthStorageKey(),
      storage.getWhatsAppInboundSpoolStorageKey(),
      storage.getWhatsAppAuthStorageKey(),
    ];

    const needles = keys.flatMap((key) => [key.toString("hex"), key.toString("base64")]);
    const disk = everythingOnDisk(sandbox);
    const logs = JSON.stringify(logged.events);
    expect(disk.length).toBeGreaterThan(0);
    for (const needle of needles) {
      expect(disk).not.toContain(needle);
      expect(logs).not.toContain(needle);
    }

    const unlocked = logged.events.filter((entry) => entry.event === "storage-key.unlocked");
    expect(unlocked).toHaveLength(1);
    expect(Object.keys(unlocked[0]?.fields as Record<string, unknown>)).toEqual(["ms"]);
    expect(logged.events).toHaveLength(1);
  });

  it("never caches in development or test mode, so environment changes still take effect", async () => {
    process.env.NODE_ENV = "test";
    process.env.SF_WHATSAPP_STORAGE_KEY = "11".repeat(32);
    const storage = await loadStorage();
    const first = storage.getWhatsAppAuthStorageKey();

    process.env.SF_WHATSAPP_STORAGE_KEY = "22".repeat(32);
    const second = storage.getWhatsAppAuthStorageKey();

    expect(second.equals(first)).toBe(false);
    expect(spawnCount()).toBe(0);
  });
});
