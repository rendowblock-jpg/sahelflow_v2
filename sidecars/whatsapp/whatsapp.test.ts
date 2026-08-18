import { describe, expect, it, vi } from "vitest";

import { WhatsAppManager } from "./whatsapp";

describe("WhatsAppManager startup recovery", () => {
  it("releases the startup guard after a failed connection attempt", async () => {
    const manager = new WhatsAppManager();
    const connect = vi.fn<() => Promise<void>>();
    connect
      .mockRejectedValueOnce(new Error("version lookup failed"))
      .mockResolvedValueOnce(undefined);

    (manager as unknown as { connect: () => Promise<void> }).connect = connect;

    await expect(manager.start()).rejects.toThrow("version lookup failed");
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
