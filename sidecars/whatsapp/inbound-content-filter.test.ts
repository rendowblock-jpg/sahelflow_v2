import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decryptMessageNode,
  proto,
  writeRandomPadMax16,
} from "@whiskeysockets/baileys";
import { afterEach, describe, expect, it, vi } from "vitest";

import { diagnostics } from "./diagnostics-log";
import { WhatsAppInboundSpool } from "./inbound-spool";
import { providerMessageSpoolAction, WhatsAppManager } from "./whatsapp";

// What this file pins (audit S05a-01 / MSG-02 and S05a-12 / MSG-12):
//   1. A message Baileys could not decrypt arrives as a content-less
//      CIPHERTEXT stub. WhatsApp then re-delivers the real message under the
//      SAME key.id. The stub must not be spooled, or the real copy is refused
//      for ever ("already bound to different content").
//   2. Reactions, protocol messages, poll votes and sender-key distribution
//      carry nothing a seller can read. They must not become blank rows that
//      bump the unread counter. This is a closed DENY-list: anything that is
//      not on it, including kinds this code has never heard of, is spooled.

const CUSTOMER = "213555010203@s.whatsapp.net";
const ACCOUNT = "213555999000:12@s.whatsapp.net";
const ME = "213555999000:12@s.whatsapp.net";

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface DeliveredBody {
  id: string;
  text: string | undefined;
}

function upsert(
  id: string,
  message: proto.IMessage | undefined,
  extra: Partial<proto.IWebMessageInfo> = {},
  fromMe = false,
): proto.IWebMessageInfo {
  return {
    key: { remoteJid: CUSTOMER, fromMe, id },
    message,
    messageTimestamp: 1_786_000_100,
    ...extra,
  };
}

/** The ids the manager hands to the spool for one upsert batch. */
function spooledIds(
  messages: ReadonlyArray<proto.IWebMessageInfo>,
  type = "notify",
): string[] {
  const manager = new WhatsAppManager();
  const ids: string[] = [];
  manager.subscribe((event) => {
    if (event.type === "message" && event.message) ids.push(event.message.key.id);
  });
  manager.ingestMessagesUpsert(type, messages);
  return ids;
}

/**
 * Run the REAL Baileys decrypt path (decode-wa-message.js) for one inbound
 * stanza. `decryptMessage` stands in for the Signal session.
 */
async function decodeWithBaileys(
  id: string,
  decryptMessage: () => Promise<Uint8Array>,
): Promise<proto.IWebMessageInfo> {
  const stanza = {
    tag: "message",
    attrs: { id, from: CUSTOMER, t: "1786000100", notify: "Client" },
    content: [
      { tag: "enc", attrs: { type: "msg", v: "2" }, content: new Uint8Array([1, 2, 3]) },
    ],
  };
  const { fullMessage, decrypt } = decryptMessageNode(
    stanza as never,
    ME,
    "",
    { decryptMessage } as never,
    { error: () => undefined } as never,
  );
  await decrypt();
  return fullMessage;
}

function cannotDecrypt(): Promise<Uint8Array> {
  return Promise.reject(new Error("Bad MAC"));
}

function decryptsTo(content: proto.IMessage): () => Promise<Uint8Array> {
  return () =>
    Promise.resolve(
      writeRandomPadMax16(proto.Message.encode(proto.Message.create(content)).finish()),
    );
}

describe("undecryptable stubs are not spooled (S05a-01)", () => {
  it("shapes the fixtures exactly as Baileys emits them", async () => {
    // Guards the test itself: the stub below is produced by Baileys' own
    // decryptMessageNode, not hand built.
    const stub = await decodeWithBaileys("STUBSHAPE0001", cannotDecrypt);
    expect(stub.messageStubType).toBe(proto.WebMessageInfo.StubType.CIPHERTEXT);
    expect(stub.message).toBeUndefined();
    expect(stub.key?.id).toBe("STUBSHAPE0001");
    expect(stub.key?.remoteJid).toBe(CUSTOMER);
    expect(stub.key?.fromMe).toBe(false);
  });

  it("does not spool a CIPHERTEXT stub", async () => {
    const stub = await decodeWithBaileys("STUBNOSPOOL001", cannotDecrypt);
    expect(spooledIds([stub], "notify")).toEqual([]);
    expect(spooledIds([stub], "append")).toEqual([]);
  });

  it("classifies a stub as decrypt-stub and never as inbound", async () => {
    const stub = await decodeWithBaileys("STUBACTION0001", cannotDecrypt);
    expect(
      providerMessageSpoolAction("notify", {
        remoteJid: stub.key?.remoteJid,
        id: stub.key?.id,
        fromMe: stub.key?.fromMe,
        message: stub.message,
        messageStubType: stub.messageStubType,
      }),
    ).toBe("decrypt-stub");
  });

  it("spools the real re-delivery that arrives later under the same key.id", async () => {
    const stub = await decodeWithBaileys("SAMEKEYID00001", cannotDecrypt);
    const real = await decodeWithBaileys(
      "SAMEKEYID00001",
      decryptsTo({ conversation: "je veux 4 chemises" }),
    );
    // Baileys builds key.id from the stanza id, so the retry is the same id.
    expect(real.key?.id).toBe(stub.key?.id);
    expect(real.messageStubType ?? null).toBeNull();

    const manager = new WhatsAppManager();
    const delivered: DeliveredBody[] = [];
    manager.subscribe((event) => {
      if (event.type === "message" && event.message) {
        delivered.push({
          id: event.message.key.id,
          text: event.message.message.conversation,
        });
      }
    });
    manager.ingestMessagesUpsert("notify", [stub]);
    manager.ingestMessagesUpsert("notify", [real]);

    expect(delivered).toEqual([
      { id: "SAMEKEYID00001", text: "je veux 4 chemises" },
    ]);
  });

  it("lets the real spool accept the re-delivery instead of refusing it for ever", async () => {
    const stub = await decodeWithBaileys("SPOOLRETRY0001", cannotDecrypt);
    const real = await decodeWithBaileys(
      "SPOOLRETRY0001",
      decryptsTo({ conversation: "adresse: 12 rue Didouche" }),
    );
    const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-content-filter-"));
    directories.push(directory);
    const spool = new WhatsAppInboundSpool({
      directory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      // A cold app: nothing is ever acknowledged, records stay on disk.
      fetchImpl: (() => Promise.reject(new Error("app unavailable"))) as unknown as typeof fetch,
      encryptionKey: Buffer.alloc(32, 7),
      retryBaseMs: 60_000,
      onCommitted: () => undefined,
    });
    const manager = new WhatsAppManager();
    const refusals: string[] = [];
    manager.subscribe((event) => {
      if (event.type !== "message" || !event.message) return;
      try {
        spool.enqueue(ACCOUNT, event.message);
      } catch (error) {
        refusals.push(error instanceof Error ? error.message : String(error));
      }
    });

    manager.ingestMessagesUpsert("notify", [stub]);
    manager.ingestMessagesUpsert("notify", [real]);
    await spool.flush();

    expect(refusals).toEqual([]);
    expect(spool.pendingCount()).toBe(1);
  });

  it("keeps a message that has real content even if Baileys also flagged a stub", () => {
    // Fail open for content: only a CONTENT-LESS stub is dropped.
    expect(
      spooledIds([
        upsert(
          "STUBWITHBODY001",
          { conversation: "partial decrypt, real text" },
          { messageStubType: proto.WebMessageInfo.StubType.CIPHERTEXT },
        ),
      ]),
    ).toEqual(["STUBWITHBODY001"]);
  });

  it("records a counts-only diagnostics line and never an id, jid or text", async () => {
    const record = vi.spyOn(diagnostics, "record");
    const stub = await decodeWithBaileys("STUBDIAG000001", cannotDecrypt);
    spooledIds([stub], "notify");

    const dropped = record.mock.calls.filter(([event]) => event === "inbound.dropped");
    expect(dropped).toEqual([
      [
        "inbound.dropped",
        { reason: "decrypt-stub", upsertType: "notify", count: 1 },
      ],
    ]);
    const serialized = JSON.stringify(record.mock.calls);
    expect(serialized).not.toContain("STUBDIAG000001");
    expect(serialized).not.toContain("213555010203");
    expect(serialized).not.toContain("@s.whatsapp.net");
    expect(serialized).not.toContain("Bad MAC");
  });

  it("does not touch a phone-sent (fromMe) stanza", () => {
    // The phone-outbound path is unchanged by this fix.
    expect(
      spooledIds([
        upsert(
          "FROMMESTUB0001",
          undefined,
          { messageStubType: proto.WebMessageInfo.StubType.CIPHERTEXT },
          true,
        ),
      ]),
    ).toEqual(["FROMMESTUB0001"]);
    expect(
      providerMessageSpoolAction("notify", {
        remoteJid: CUSTOMER,
        id: "FROMMESTUB0001",
        fromMe: true,
        message: undefined,
        messageStubType: proto.WebMessageInfo.StubType.CIPHERTEXT,
      }),
    ).toBe("phone-outbound");
  });
});

describe("non-content upserts are not spooled (S05a-12)", () => {
  const protocol = proto.Message.ProtocolMessage.Type;
  const target = { remoteJid: CUSTOMER, fromMe: true, id: "EARLIERMSG0001" };

  const dropped: Array<[string, proto.IMessage]> = [
    [
      "a reaction",
      { reactionMessage: { key: target, text: "👍", senderTimestampMs: 1 } },
    ],
    [
      "an encrypted reaction",
      { encReactionMessage: { targetMessageKey: target } },
    ],
    [
      "a protocol REVOKE (delete for everyone)",
      { protocolMessage: { type: protocol.REVOKE, key: target } },
    ],
    [
      "a protocol history-sync notice",
      { protocolMessage: { type: protocol.HISTORY_SYNC_NOTIFICATION } },
    ],
    [
      "a protocol ephemeral-setting change",
      { protocolMessage: { type: protocol.EPHEMERAL_SETTING, ephemeralExpiration: 86400 } },
    ],
    [
      "a protocol edit that carries no replacement body",
      { protocolMessage: { type: protocol.MESSAGE_EDIT, key: target } },
    ],
    [
      "a poll vote",
      { pollUpdateMessage: { pollCreationMessageKey: target } },
    ],
    [
      "a sender-key distribution on its own",
      {
        senderKeyDistributionMessage: {
          groupId: "g",
          axolotlSenderKeyDistributionMessage: new Uint8Array([1]),
        },
        messageContextInfo: { deviceListMetadataVersion: 2 },
      },
    ],
    ["a keep-in-chat action", { keepInChatMessage: { key: target } }],
    ["a pin-in-chat action", { pinInChatMessage: { key: target } }],
    [
      "a reaction inside a disappearing-message wrapper",
      {
        ephemeralMessage: {
          message: { reactionMessage: { key: target, text: "❤️" } },
        },
      },
    ],
  ];

  it.each(dropped)("does not spool %s", (_name, message) => {
    expect(spooledIds([upsert("NONCONTENT0001", message)])).toEqual([]);
    expect(spooledIds([upsert("NONCONTENT0002", message)], "append")).toEqual([]);
  });

  it("classifies those kinds as non-content", () => {
    for (const [, message] of dropped) {
      expect(
        providerMessageSpoolAction("notify", {
          remoteJid: CUSTOMER,
          id: "NONCONTENT0003",
          fromMe: false,
          message,
        }),
      ).toBe("non-content");
    }
  });

  it("records a counts-only diagnostics line for dropped non-content", () => {
    const record = vi.spyOn(diagnostics, "record");
    spooledIds([
      upsert("NONCONTENT0004", { reactionMessage: { key: target, text: "👍" } }),
      upsert("NONCONTENT0005", { protocolMessage: { type: protocol.REVOKE, key: target } }),
    ]);
    const dropLines = record.mock.calls.filter(([event]) => event === "inbound.dropped");
    expect(dropLines).toEqual([
      [
        "inbound.dropped",
        { reason: "non-content", upsertType: "notify", count: 2 },
      ],
    ]);
    const serialized = JSON.stringify(record.mock.calls);
    expect(serialized).not.toContain("NONCONTENT");
    expect(serialized).not.toContain("213555010203");
    expect(serialized).not.toContain("EARLIERMSG");
  });

  it("does not touch phone-sent (fromMe) reactions or protocol messages", () => {
    expect(
      spooledIds([
        upsert("FROMMEREACT001", { reactionMessage: { key: target, text: "👍" } }, {}, true),
      ]),
    ).toEqual(["FROMMEREACT001"]);
  });
});

describe("the same rules hold for messages decoded by Baileys' own protobuf path", () => {
  const key = { remoteJid: CUSTOMER, fromMe: true, id: "EARLIERMSG0001" };
  const cases: Array<[string, proto.IMessage, boolean]> = [
    ["a reaction", { reactionMessage: { key, text: "👍" } }, false],
    [
      "a protocol REVOKE",
      { protocolMessage: { type: proto.Message.ProtocolMessage.Type.REVOKE, key } },
      false,
    ],
    [
      "a reaction in a disappearing-message wrapper",
      { ephemeralMessage: { message: { reactionMessage: { key, text: "❤️" } } } },
      false,
    ],
    ["a plain text", { conversation: "bonjour" }, true],
    [
      "a text in a disappearing-message wrapper",
      { ephemeralMessage: { message: { conversation: "message qui disparait" } } },
      true,
    ],
    ["an image with no caption", { imageMessage: { mimetype: "image/jpeg" } }, true],
    ["a sticker", { stickerMessage: { mimetype: "image/webp" } }, true],
    [
      "a location",
      { locationMessage: { degreesLatitude: 36.75, degreesLongitude: 3.06 } },
      true,
    ],
    ["a contact", { contactMessage: { displayName: "Ali", vcard: "BEGIN:VCARD" } }, true],
    [
      "an edit that carries the corrected text",
      {
        editedMessage: {
          message: {
            protocolMessage: {
              type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
              key,
              editedMessage: { conversation: "adresse corrigee" },
            },
          },
        },
      },
      true,
    ],
    [
      "a text that carries a piggy-backed sender key",
      {
        conversation: "bonjour",
        messageContextInfo: { deviceListMetadataVersion: 2 },
        senderKeyDistributionMessage: { groupId: "g" },
      },
      true,
    ],
  ];

  it.each(cases)("%s", async (_name, content, expectSpooled) => {
    const decoded = await decodeWithBaileys("DECODEDKIND0001", decryptsTo(content));
    expect(decoded.messageStubType ?? null).toBeNull();
    expect(spooledIds([decoded])).toEqual(expectSpooled ? ["DECODEDKIND0001"] : []);
  });
});

describe("real content is still spooled (fail open)", () => {
  const spooled: Array<[string, proto.IMessage | undefined]> = [
    ["a plain text", { conversation: "bonjour" }],
    ["an extended text with a link", { extendedTextMessage: { text: "voir https://example.com" } }],
    ["an image with no caption", { imageMessage: { mimetype: "image/jpeg" } }],
    ["a sticker", { stickerMessage: { mimetype: "image/webp" } }],
    ["a location", { locationMessage: { degreesLatitude: 36.75, degreesLongitude: 3.06 } }],
    ["a live location", { liveLocationMessage: { degreesLatitude: 36.75, degreesLongitude: 3.06 } }],
    ["a contact card", { contactMessage: { displayName: "Ali", vcard: "BEGIN:VCARD" } }],
    ["a voice note", { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true } }],
    ["a video", { videoMessage: { mimetype: "video/mp4" } }],
    ["a document", { documentMessage: { mimetype: "application/pdf", fileName: "bon.pdf" } }],
    ["a button reply", { buttonsResponseMessage: { selectedButtonId: "yes" } }],
    ["a list reply", { listResponseMessage: { title: "Option 2" } }],
    [
      "a text that carries a piggy-backed sender key and context info",
      {
        conversation: "bonjour",
        senderKeyDistributionMessage: { groupId: "g" },
        messageContextInfo: { deviceListMetadataVersion: 2 },
      },
    ],
    [
      "a kind this code has never heard of",
      { someFutureKindMessage: { anything: true } } as unknown as proto.IMessage,
    ],
    // An upsert with neither a body nor a stub is not on the deny-list, so it
    // keeps today's behaviour and is still delivered.
    ["a body-less, stub-less upsert", undefined],
  ];

  it.each(spooled)("spools %s", (_name, message) => {
    expect(spooledIds([upsert("REALCONTENT001", message)])).toEqual(["REALCONTENT001"]);
    expect(spooledIds([upsert("REALCONTENT002", message)], "append")).toEqual([
      "REALCONTENT002",
    ]);
  });

  it("classifies those kinds as inbound", () => {
    for (const [, message] of spooled) {
      expect(
        providerMessageSpoolAction("notify", {
          remoteJid: CUSTOMER,
          id: "REALCONTENT003",
          fromMe: false,
          message,
        }),
      ).toBe("inbound");
    }
  });

  it("unwraps disappearing-message, view-once, document-caption and edit wrappers first", () => {
    const wrapped: Array<[string, proto.IMessage]> = [
      [
        "ephemeralMessage",
        { ephemeralMessage: { message: { conversation: "message qui disparait" } } },
      ],
      [
        "viewOnceMessage",
        { viewOnceMessage: { message: { imageMessage: { mimetype: "image/jpeg" } } } },
      ],
      [
        "viewOnceMessageV2",
        { viewOnceMessageV2: { message: { videoMessage: { mimetype: "video/mp4" } } } },
      ],
      [
        "documentWithCaptionMessage",
        {
          documentWithCaptionMessage: {
            message: {
              documentMessage: { mimetype: "application/pdf", caption: "bon de commande" },
            },
          },
        },
      ],
      [
        "ephemeral around view-once",
        {
          ephemeralMessage: {
            message: {
              viewOnceMessageV2: {
                message: { imageMessage: { mimetype: "image/jpeg" } },
              },
            },
          },
        },
      ],
      [
        "editedMessage wrapper around an edit with a body",
        {
          editedMessage: {
            message: {
              protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                key: { remoteJid: CUSTOMER, fromMe: false, id: "EARLIERMSG0001" },
                editedMessage: { conversation: "adresse corrigee" },
              },
            },
          },
        },
      ],
      [
        "bare protocol edit with a body",
        {
          protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
            key: { remoteJid: CUSTOMER, fromMe: false, id: "EARLIERMSG0001" },
            editedMessage: { conversation: "numero corrige 0555 01 02 03" },
          },
        },
      ],
    ];
    for (const [name, message] of wrapped) {
      expect(spooledIds([upsert(`WRAPPED-${name.length}`, message)]), name).toEqual([
        `WRAPPED-${name.length}`,
      ]);
    }
  });

  it("keeps the unchanged skip rules for status, group and unknown shapes", () => {
    expect(
      providerMessageSpoolAction("notify", { remoteJid: "status@broadcast", id: "X1", fromMe: false }),
    ).toBe("skip");
    expect(
      providerMessageSpoolAction("notify", { remoteJid: "1203@g.us", id: "X2", fromMe: false }),
    ).toBe("skip");
    expect(
      providerMessageSpoolAction("history", { remoteJid: CUSTOMER, id: "X3", fromMe: false }),
    ).toBe("skip");
    expect(providerMessageSpoolAction("notify", { remoteJid: CUSTOMER, id: "", fromMe: false })).toBe(
      "skip",
    );
  });
});
