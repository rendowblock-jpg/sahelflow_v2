import { generateWAMessage } from "@whiskeysockets/baileys";
import { describe, expect, it } from "vitest";

import {
  persistWhatsAppPhoneOutbound,
  phoneOutboundSchema,
} from "../../src/lib/whatsapp/phone-outbound";
import { WhatsAppManager, type IncomingMessage } from "./whatsapp";

// Root cause of the stuck inbound record in the Founder's Internal.44
// diagnostics (REQUEST_VALIDATION_FAILED, attempt 17 and 18, about 25 hours):
// Baileys echoes every message SahelFlow SENDS back through `messages.upsert`,
// and builds that echo with `WebMessageInfo.fromObject`, which fills an unset
// `key.participant` with an empty string. A customer's message does not take
// that route and keeps `participant` unset. The sidecar forwarded the empty
// string (`participant ?? undefined` keeps ""), and the app's schema needs at
// least one character, so the echo was refused with a 400 on every retry, for
// every kind of message we send.
//
// These tests use Baileys' own objects, not hand-written ones.

const ME = "213555999000:12@s.whatsapp.net";
const CHAT = "213555123456@s.whatsapp.net";
const LID_CHAT = "187654321098765@lid";
const SPOOL_ID = "a".repeat(64);

interface ManagerInternals {
  toIncoming(message: unknown): IncomingMessage | null;
}

/** The sidecar's real conversion of a provider message (it does not use `this`). */
function toIncoming(message: unknown): IncomingMessage {
  const built = (WhatsAppManager.prototype as unknown as ManagerInternals).toIncoming.call(
    undefined,
    message,
  );
  if (!built) throw new Error("toIncoming returned null");
  return built;
}

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

function envelope(message: IncomingMessage): unknown {
  return wire({
    spoolId: SPOOL_ID,
    accountId: ME,
    receivedAt: "2026-10-17T15:50:52.000Z",
    message,
  });
}

const options = {
  userJid: ME,
  upload: async () => ({}) as never,
  getUrlInfo: async () => undefined,
};

const quotedKey = { remoteJid: CHAT, fromMe: false, id: "ABCDEF0123456789" };

async function ownSends(jid: string): Promise<Array<[string, unknown]>> {
  const base = await generateWAMessage(jid, { text: "original" }, options);
  const make = (content: object, extra: object = {}) =>
    generateWAMessage(jid, content as never, { ...options, ...extra } as never);
  return [
    ["text", await make({ text: "hello" })],
    [
      "reply",
      await make(
        { text: "answer" },
        { quoted: { key: quotedKey, message: { conversation: "question" } } },
      ),
    ],
    ["reaction", await make({ react: { text: "👍", key: quotedKey } })],
    ["edit", await make({ text: "fixed", edit: base.key })],
    ["delete", await make({ delete: base.key })],
    ["disappearing", await make({ text: "secret" }, { ephemeralExpiration: 86_400 })],
    ["location", await make({ location: { degreesLatitude: 36.75, degreesLongitude: 3.05 } })],
    [
      "contact",
      await make({
        contacts: {
          displayName: "A",
          contacts: [{ vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:A\nTEL:+213555\nEND:VCARD" }],
        },
      }),
    ],
  ];
}

describe.each([
  ["a phone-number chat", CHAT],
  ["a hidden-ID (@lid) chat", LID_CHAT],
])("the echo of what SahelFlow sends, in %s", (_label, jid) => {
  it("is accepted by the app for every kind of message we send", async () => {
    const sends = await ownSends(jid);
    expect(sends).toHaveLength(8);
    for (const [kind, provider] of sends) {
      const result = phoneOutboundSchema.safeParse(envelope(toIncoming(provider)));
      expect(
        result.success,
        `${kind}: ${result.success ? "" : JSON.stringify(result.error.issues.map((issue) => issue.path))}`,
      ).toBe(true);
    }
  });

  it("keeps the identity the app already holds: same chat, same id, same text, still from us", async () => {
    for (const [kind, provider] of await ownSends(jid)) {
      const sent = provider as { key: { remoteJid: string; id: string } };
      const incoming = toIncoming(provider);
      expect(incoming.key.remoteJid, kind).toBe(sent.key.remoteJid);
      expect(incoming.key.id, kind).toBe(sent.key.id);
      expect(incoming.key.fromMe, kind).toBe(true);
    }
  });
});

describe("why the echo was refused before", () => {
  it("Baileys gives our own sends an empty participant, and the app refuses an empty participant", async () => {
    const [[, provider]] = await ownSends(CHAT);
    const raw = (provider as { key: { participant?: unknown } }).key.participant;
    if (raw !== "") {
      // Baileys no longer fills it in: the original defect cannot recur this way.
      expect(raw === undefined || raw === null || typeof raw === "string").toBe(true);
      return;
    }
    // The shape the sidecar used to forward, written out.
    const before = wire({
      spoolId: SPOOL_ID,
      accountId: ME,
      receivedAt: "2026-10-17T15:50:52.000Z",
      message: {
        key: { ...(provider as { key: object }).key, participant: raw ?? undefined },
        message: { conversation: "hello" },
        messageTimestamp: 1_792_345_163,
      },
    });
    const refused = phoneOutboundSchema.safeParse(before);
    expect(refused.success).toBe(false);
    if (!refused.success) {
      expect(refused.error.issues.map((issue) => issue.path.join("."))).toEqual([
        "message.key.participant",
      ]);
    }
  });

  it("the app now takes the echo through its real persistence path and recognises our own message", async () => {
    const [[, provider]] = await ownSends(CHAT);
    const sentId = (provider as { key: { id: string } }).key.id;
    const lookups: string[] = [];
    const context = {
      prisma: {
        whatsAppOutboundEffect: {
          findUnique: async ({ where }: { where: { providerMessageId: string } }) => {
            lookups.push(where.providerMessageId);
            return { messageId: "message-already-stored" };
          },
        },
      },
      whatsAppProviderAccountId: ME,
    };

    const stored = await persistWhatsAppPhoneOutbound(
      context as never,
      envelope(toIncoming(provider)),
    );

    expect(stored).toEqual({ messageId: "message-already-stored", created: false, replayed: true });
    expect(lookups).toEqual([sentId]);
  });
});
