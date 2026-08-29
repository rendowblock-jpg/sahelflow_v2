import { describe, expect, it, vi } from "vitest";

import { isIndividualInboundJid, WhatsAppManager } from "./whatsapp";

describe("WhatsAppManager startup recovery", () => {
  it("reports disconnected and releases the guard after a failed start", async () => {
    const manager = new WhatsAppManager();
    const events: string[] = [];
    manager.subscribe((event) => {
      if (event.type === "status" && event.status) events.push(event.status);
    });
    const connect = vi.fn<() => Promise<void>>();
    connect
      .mockRejectedValueOnce(new Error("pairing setup failed"))
      .mockResolvedValueOnce(undefined);

    (manager as unknown as { connect: () => Promise<void> }).connect = connect;

    await expect(manager.start()).rejects.toThrow("pairing setup failed");
    expect(manager.getStatus()).toMatchObject({
      status: "disconnected",
      hasQr: false,
    });
    expect(events.at(-1)).toBe("disconnected");

    await expect(manager.start()).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("coalesces overlapping startup attempts while one is still active", async () => {
    const manager = new WhatsAppManager();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const connect = vi.fn<() => Promise<void>>().mockReturnValue(pending);

    (manager as unknown as { connect: () => Promise<void> }).connect = connect;

    const first = manager.start();
    await Promise.resolve();
    await manager.start();

    expect(connect).toHaveBeenCalledTimes(1);

    release?.();
    await first;
  });
});

describe("C1 ingress scope (isIndividualInboundJid)", () => {
  it("admits canonical PN and LID addresses only", () => {
    expect(isIndividualInboundJid("213555010203@s.whatsapp.net")).toBe(true);
    expect(isIndividualInboundJid("123456789012345@lid")).toBe(true);
  });

  it("rejects broadcast, group, newsletter, and empty jids", () => {
    expect(isIndividualInboundJid("status@broadcast")).toBe(false);
    expect(isIndividualInboundJid("12036302abcdefgh@g.us")).toBe(false);
    expect(isIndividualInboundJid("12345@newsletter")).toBe(false);
    expect(isIndividualInboundJid("")).toBe(false);
    expect(isIndividualInboundJid(undefined)).toBe(false);
  });
});

describe("C1 reconnect watchdog", () => {
  it("keeps retrying in the background while disconnected and stops once cleared", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      const connect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      (manager as unknown as { connect: () => Promise<void> }).connect = connect;
      const internal = manager as unknown as {
        status: string;
        scheduleReconnectWatchdog: () => void;
        clearReconnectWatchdog: () => void;
      };
      internal.status = "disconnected";
      internal.scheduleReconnectWatchdog();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledTimes(2);

      // Connection restored: the watchdog must stop on its own.
      internal.status = "connected";
      internal.clearReconnectWatchdog();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips ticks while a connection attempt is in flight", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      const connect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      (manager as unknown as { connect: () => Promise<void> }).connect = connect;
      const internal = manager as unknown as {
        status: string;
        scheduleReconnectWatchdog: () => void;
      };
      internal.status = "connecting";
      internal.scheduleReconnectWatchdog();

      await vi.advanceTimersByTimeAsync(180_000);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps retrying when a watchdog attempt fails truthfully", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      const connect = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("version lookup failed"))
        .mockResolvedValueOnce(undefined);
      (manager as unknown as { connect: () => Promise<void> }).connect = connect;
      const internal = manager as unknown as {
        status: string;
        scheduleReconnectWatchdog: () => void;
      };
      internal.status = "disconnected";
      internal.scheduleReconnectWatchdog();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledTimes(1);
      // The failed attempt reset the status to disconnected, so the next
      // tick retries instead of the loop being dead.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
