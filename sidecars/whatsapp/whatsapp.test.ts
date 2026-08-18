import { describe, expect, it, vi } from "vitest";

import { WhatsAppManager } from "./whatsapp";

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
