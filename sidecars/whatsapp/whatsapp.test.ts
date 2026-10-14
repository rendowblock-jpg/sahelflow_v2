import { generateWAMessage } from "@whiskeysockets/baileys";
import { describe, expect, it, vi } from "vitest";

import {
  isIndividualInboundJid,
  providerMessageSpoolAction,
  quotedSendContent,
  WhatsAppManager,
} from "./whatsapp";
import type { SidecarQuotedContext } from "./whatsapp";

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

describe("offline append upserts", () => {
  it("spools an append upsert for a real 1:1 inbound and skips status and group", () => {
    expect(
      providerMessageSpoolAction("append", {
        remoteJid: "213555010203@s.whatsapp.net",
        id: "APPENDINBOUND01",
        fromMe: false,
      }),
    ).toBe("inbound");
    expect(
      providerMessageSpoolAction("append", {
        remoteJid: "status@broadcast",
        id: "APPENDSTATUS0001",
        fromMe: false,
      }),
    ).toBe("skip");
    expect(
      providerMessageSpoolAction("append", {
        remoteJid: "12036302abcdefgh@g.us",
        id: "APPENDGROUP00001",
        fromMe: false,
      }),
    ).toBe("skip");
    expect(
      providerMessageSpoolAction("notify", {
        remoteJid: "123456789012345@lid",
        id: "NOTIFYLID0000001",
        fromMe: false,
      }),
    ).toBe("inbound");

    const manager = new WhatsAppManager();
    const spooled: string[] = [];
    manager.subscribe((event) => {
      if (event.type === "message" && event.message) {
        spooled.push(event.message.key.remoteJid);
      }
    });
    manager.ingestMessagesUpsert("append", [
      {
        key: {
          remoteJid: "213555010203@s.whatsapp.net",
          fromMe: false,
          id: "APPENDINBOUND01",
        },
        message: { conversation: "offline hello" },
        messageTimestamp: 1,
      },
      {
        key: {
          remoteJid: "status@broadcast",
          fromMe: false,
          id: "APPENDSTATUS0001",
        },
        message: { conversation: "status" },
        messageTimestamp: 1,
      },
      {
        key: {
          remoteJid: "12036302abcdefgh@g.us",
          fromMe: false,
          id: "APPENDGROUP00001",
        },
        message: { conversation: "group" },
        messageTimestamp: 1,
      },
    ]);
    expect(spooled).toEqual(["213555010203@s.whatsapp.net"]);
  });
});

const QUOTE: SidecarQuotedContext = {
  stanzaId: "WASTANZA0001",
  fromMe: false,
  stubKind: "text",
  stubText: "hi",
  participant: "999999999999@lid",
};

describe("quoted send stanza shape", () => {
  it("does not let Baileys put a group-style participant on a 1:1 or @lid quote", async () => {
    for (const jid of ["213555010203@s.whatsapp.net", "123456789012345@lid"]) {
      const content = quotedSendContent(jid, { text: "reply" }, QUOTE);
      const built = await generateWAMessage(jid, content, {
        userJid: "213555000000:1@s.whatsapp.net",
        messageId: "OUTBOUNDQUOTE01",
      });
      const context = built.message?.extendedTextMessage?.contextInfo;
      expect(context?.stanzaId).toBe("WASTANZA0001");
      expect(context?.quotedMessage?.conversation).toBe("hi");
      expect(context?.participant ?? "").toBe("");
      expect(context?.remoteJid ?? "").toBe("");

      const poisoned = await generateWAMessage(
        jid,
        { text: "reply" },
        {
          userJid: "213555000000:1@s.whatsapp.net",
          messageId: "OUTBOUNDQUOTE01",
          quoted: {
            key: { remoteJid: jid, fromMe: false, id: "WASTANZA0001" },
            message: { conversation: "hi" },
          },
        },
      );
      expect(poisoned.message?.extendedTextMessage?.contextInfo?.participant).toBe(
        jid,
      );
    }
  });

  it("does not send a second stanza when the quoted attempt already dispatched", async () => {
    const manager = new WhatsAppManager();
    const sendMessage = vi.fn(
      async (
        _jid: string,
        _content: unknown,
        options?: { messageId?: string },
      ) => {
        manager.recordProviderWrite(options?.messageId ?? "");
        throw new Error("after write");
      },
    );
    const internal = manager as unknown as {
      sock: { sendMessage: typeof sendMessage };
      status: string;
    };
    internal.sock = { sendMessage };
    internal.status = "connected";

    await expect(
      manager.sendMessage(
        "213555010203@s.whatsapp.net",
        "reply",
        "PROVIDERMSG0001",
        QUOTE,
      ),
    ).rejects.toThrow("after write");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("retries without the quote only when the first attempt never wrote", async () => {
    const manager = new WhatsAppManager();
    const seen: Array<{ contextInfo?: unknown }> = [];
    const sendMessage = vi.fn(async (_jid: string, content: { contextInfo?: unknown }) => {
      seen.push(content);
      if (seen.length === 1) throw new Error("before write");
      return { key: { id: "PROVIDERMSG0001" }, status: "sent" };
    });
    const internal = manager as unknown as {
      sock: { sendMessage: typeof sendMessage };
      status: string;
    };
    internal.sock = { sendMessage };
    internal.status = "connected";

    await expect(
      manager.sendMessage(
        "213555010203@s.whatsapp.net",
        "reply",
        "PROVIDERMSG0001",
        QUOTE,
      ),
    ).resolves.toMatchObject({ id: "PROVIDERMSG0001" });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(seen[0]?.contextInfo).toBeTruthy();
    expect(seen[1]?.contextInfo).toBeUndefined();
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
