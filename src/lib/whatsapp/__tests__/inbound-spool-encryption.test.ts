import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WhatsAppInboundSpool,
  type WhatsAppInboundSpoolEnvelope,
} from "../../../../sidecars/whatsapp/inbound-spool";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-sealed-"));
  directories.push(directory);
  return directory;
}

function message(): WhatsAppInboundSpoolEnvelope["message"] {
  return {
    key: {
      remoteJid: "213555000333@s.whatsapp.net",
      fromMe: false,
      id: "PROVIDER-SEALED-1",
    },
    message: { conversation: "Secret spool body" },
    messageTimestamp: 1_786_000_200,
    pushName: "Secret Client",
  };
}

function unavailableResponse(): Response {
  return new Response(JSON.stringify({ code: "APP_UNAVAILABLE" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("WhatsApp inbound spool encryption authority", () => {
  it("keeps all provider/customer plaintext outside the durable file", async () => {
    const directory = temporaryDirectory();
    const spool = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      encryptionKey: Buffer.alloc(32, 1),
      fetchImpl: vi.fn().mockResolvedValue(unavailableResponse()) as unknown as typeof fetch,
      onCommitted: vi.fn(),
    });

    const envelope = spool.enqueue("213555999000:12@s.whatsapp.net", message());
    await spool.flush();

    const serialized = readFileSync(
      join(directory, `${envelope.spoolId}.json`),
      "utf8",
    );
    expect(serialized).toContain('"algorithm":"aes-256-gcm"');
    expect(serialized).toContain('"ciphertext"');
    expect(serialized).not.toContain("Secret spool body");
    expect(serialized).not.toContain("Secret Client");
    expect(serialized).not.toContain("213555000333");
    expect(serialized).not.toContain("213555999000");
    expect(serialized).not.toContain("PROVIDER-SEALED-1");
  });

  it("sets a record the restart key cannot authenticate aside instead of blocking sidecar startup", async () => {
    const directory = temporaryDirectory();
    const first = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      encryptionKey: Buffer.alloc(32, 2),
      fetchImpl: vi.fn().mockResolvedValue(unavailableResponse()) as unknown as typeof fetch,
      onCommitted: vi.fn(),
    });

    const envelope = first.enqueue("213555999000:12@s.whatsapp.net", message());
    await first.flush();
    expect(readdirSync(directory)).toHaveLength(1);
    const sealedBytes = readFileSync(join(directory, `${envelope.spoolId}.json`), "utf8");

    // One unreadable record used to make this constructor throw, which kept the
    // whole sidecar (and every send) down. It is now kept aside, byte for byte,
    // and the sidecar starts.
    const restarted = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      encryptionKey: Buffer.alloc(32, 3),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      onCommitted: vi.fn(),
    });

    expect(restarted.pendingCount()).toBe(0);
    const aside = readdirSync(join(directory, "quarantine"));
    expect(aside).toHaveLength(1);
    expect(aside[0]).toMatch(/\.authentication_failed\.json$/);
    expect(readFileSync(join(directory, "quarantine", aside[0] ?? ""), "utf8")).toBe(sealedBytes);
    expect(restarted.snapshot().quarantined).toBe(1);
  });
});
