import { describe, expect, it, vi } from "vitest";

import { executeQueuedRemoteCommands } from "./remote-command-executor";

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const SHOP = "fedcba9876543210fedcba9876543210";

function input(client: unknown, after = 7) {
  return {
    client: client as never,
    desktopKeys: {} as never,
    context: {
      prisma: {} as never,
      shop: { workspaceId: WORKSPACE, shopId: SHOP, installationId: "a".repeat(32) } as never,
    },
    after,
  };
}

describe("executeQueuedRemoteCommands call budget", () => {
  it("does not ask for the device list when the relay has no command for us", async () => {
    const pollCommands = vi.fn(async () => ({
      commands: [],
      nextCursor: 7,
      pairedDevices: 2,
      activeDevices: 1,
    }));
    const listDevices = vi.fn(async () => ({ devices: [] }));
    const result = await executeQueuedRemoteCommands(input({ pollCommands, listDevices }));
    expect(pollCommands).toHaveBeenCalledTimes(1);
    expect(listDevices).not.toHaveBeenCalled();
    expect(result.completed).toBe(0);
    expect(result.nextCursor).toBe(7);
  });

  it("hands the relay's presence report back so the worker can pace itself", async () => {
    const client = {
      pollCommands: async () => ({ commands: [], nextCursor: 7, pairedDevices: 3, activeDevices: 0 }),
      listDevices: async () => ({ devices: [] }),
    };
    const result = await executeQueuedRemoteCommands(input(client));
    expect(result.hint).toEqual({ pairedDevices: 3, activeDevices: 0 });
  });

  it("works against a relay that does not report presence yet", async () => {
    const client = {
      pollCommands: async () => ({ commands: [], nextCursor: 7 }),
      listDevices: async () => ({ devices: [] }),
    };
    const result = await executeQueuedRemoteCommands(input(client));
    expect(result.hint).toEqual({ pairedDevices: undefined, activeDevices: undefined });
  });

  it("refuses a cursor that moves backwards before doing anything else", async () => {
    const listDevices = vi.fn(async () => ({ devices: [] }));
    const client = {
      pollCommands: async () => ({ commands: [], nextCursor: 3, pairedDevices: 0, activeDevices: 0 }),
      listDevices,
    };
    await expect(executeQueuedRemoteCommands(input(client, 7))).rejects.toThrow(/cursor is invalid/);
    expect(listDevices).not.toHaveBeenCalled();
  });

  it("asks for the device list exactly once when a command did arrive", async () => {
    const listDevices = vi.fn(async () => ({ devices: [] }));
    const client = {
      pollCommands: async () => ({
        commands: [{ relaySequence: 8, commandId: "command_bad", envelope: { not: "an envelope" } }],
        nextCursor: 8,
        pairedDevices: 1,
        activeDevices: 1,
      }),
      listDevices,
    };
    // The malformed envelope is refused, but only after the device list was requested once.
    await expect(executeQueuedRemoteCommands(input(client))).rejects.toThrow(/envelope authority is invalid/);
    expect(listDevices).toHaveBeenCalledTimes(1);
  });
});
