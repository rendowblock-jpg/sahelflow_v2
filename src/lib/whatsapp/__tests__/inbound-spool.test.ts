import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveWhatsAppInboundSpoolId,
  WhatsAppInboundSpool,
  type WhatsAppInboundSpoolEnvelope,
} from "../../../../sidecars/whatsapp/inbound-spool";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-inbound-"));
  directories.push(directory);
  return directory;
}

function message(text = "Bonjour"): WhatsAppInboundSpoolEnvelope["message"] {
  return {
    key: {
      remoteJid: "213555000111@s.whatsapp.net",
      fromMe: false,
      id: "PROVIDER-MESSAGE-1",
    },
    message: { conversation: text },
    messageTimestamp: 1_786_000_000,
    pushName: "Client",
  };
}

function successResponse(ingressEventId = "ingress-1", replayed = false): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      acknowledged: true,
      ingressEventId,
      replayed,
    }),
    { status: replayed ? 200 : 201, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("durable WhatsApp inbound sidecar spool", () => {
  it("commits encrypted spool evidence before app delivery and publishes only after acknowledgement", async () => {
    const directory = temporaryDirectory();
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;
    const committed = vi.fn();
    const spool = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl,
      onCommitted: committed,
    });

    const envelope = spool.enqueue("213555999000:12@s.whatsapp.net", message());

    expect(readdirSync(directory)).toEqual([`${envelope.spoolId}.json`]);
    expect(committed).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const stored = readFileSync(join(directory, `${envelope.spoolId}.json`), "utf8");
    expect(stored).toContain('"ciphertext"');
    expect(stored).not.toContain("PROVIDER-MESSAGE-1");
    expect(stored).not.toContain("213555000111");
    expect(stored).not.toContain("213555999000");
    expect(stored).not.toContain("Bonjour");
    expect(stored).not.toContain("Client");

    resolveFetch?.(successResponse());
    await spool.flush();

    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledWith(
      envelope,
      expect.objectContaining({ ingressEventId: "ingress-1" }),
    );
    expect(spool.pendingCount()).toBe(0);
  });

  it("retains app-unavailable work and retries it after restart-safe backoff", async () => {
    const directory = temporaryDirectory();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("app unavailable"))
      .mockResolvedValueOnce(successResponse());
    const committed = vi.fn();
    const spool = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryBaseMs: 10,
      onCommitted: committed,
    });

    spool.enqueue("213555999000:12@s.whatsapp.net", message());
    await spool.flush();
    expect(spool.pendingCount()).toBe(1);
    expect(committed).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await spool.flush();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(spool.pendingCount()).toBe(0);
  });

  it("deduplicates the same provider identity and rejects changed content", async () => {
    const directory = temporaryDirectory();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "APP_UNAVAILABLE" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const spool = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onCommitted: vi.fn(),
    });
    const accountId = "213555999000:12@s.whatsapp.net";

    const first = spool.enqueue(accountId, message(), new Date("2026-08-03T09:00:00Z"));
    await spool.flush();
    const replay = spool.enqueue(accountId, message(), new Date("2026-08-03T10:00:00Z"));
    await spool.flush();

    expect(replay).toEqual(first);
    expect(readdirSync(directory)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(deriveWhatsAppInboundSpoolId(accountId, message())).toBe(first.spoolId);
    expect(() => spool.enqueue(accountId, message("Changed content"))).toThrow(
      /different content/i,
    );
  });

  it("replays a committed encrypted file after a publication crash without calling the app again", async () => {
    const directory = temporaryDirectory();
    const appFetch = vi.fn().mockResolvedValue(successResponse("ingress-restart"));
    const crashingPublisher = vi.fn(() => {
      throw new Error("publication crash");
    });
    const firstProcess = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl: appFetch as unknown as typeof fetch,
      retryBaseMs: 10,
      onCommitted: crashingPublisher,
    });

    firstProcess.enqueue("213555999000:12@s.whatsapp.net", message());
    await firstProcess.flush();
    expect(firstProcess.pendingCount()).toBe(1);
    expect(appFetch).toHaveBeenCalledTimes(1);

    const recoveredPublisher = vi.fn();
    const restarted = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl: appFetch as unknown as typeof fetch,
      onCommitted: recoveredPublisher,
    });
    await restarted.flush();

    expect(appFetch).toHaveBeenCalledTimes(1);
    expect(recoveredPublisher).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          key: expect.objectContaining({ id: "PROVIDER-MESSAGE-1" }),
        }),
      }),
      expect.objectContaining({ ingressEventId: "ingress-restart" }),
    );
    expect(restarted.pendingCount()).toBe(0);
  });

  it("sends the private bearer token and exact durable envelope", async () => {
    const directory = temporaryDirectory();
    const fetchImpl = vi.fn().mockResolvedValue(successResponse());
    const spool = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000/",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onCommitted: vi.fn(),
    });

    const envelope = spool.enqueue("213555999000:12@s.whatsapp.net", message());
    await spool.flush();

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/whatsapp/inbound",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-sidecar-token-1234",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(envelope),
      }),
    );
  });
});
