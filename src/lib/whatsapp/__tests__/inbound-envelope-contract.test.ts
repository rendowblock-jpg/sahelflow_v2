import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  conformIncomingForApp,
  conformMessageTimestamp,
  conformParticipant,
  conformPushName,
} from "../../../../sidecars/whatsapp/inbound-envelope";
import type { IncomingMessage } from "../../../../sidecars/whatsapp/whatsapp";
import { whatsappInboundEnvelopeSchema } from "../inbound-ingress";

// The sidecar spools an envelope and the app refuses the whole thing if one
// field is out of shape. The sidecar's own spool check never looked at the
// schema, so a provider value in an odd shape was refused on every retry.
// These tests run real envelopes through the app's real schema.

const SPOOL_ID = "a".repeat(64);

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

interface Parts {
  participant?: unknown;
  pushName?: unknown;
  messageTimestamp?: unknown;
}

const DEFAULTS: Parts = {
  participant: undefined,
  pushName: "Client",
  messageTimestamp: 1_792_341_426,
};

function envelopeOf(message: unknown): unknown {
  return {
    spoolId: SPOOL_ID,
    accountId: "213555999000:12@s.whatsapp.net",
    receivedAt: "2026-10-17T15:50:52.000Z",
    message,
  };
}

/** The message exactly as the sidecar built it before this change (toIncoming in whatsapp.ts). */
function legacyMessage(overrides: Parts): Record<string, unknown> {
  const parts = { ...DEFAULTS, ...overrides };
  const stamp = parts.messageTimestamp;
  return {
    key: {
      remoteJid: "213555123456@s.whatsapp.net",
      fromMe: false,
      id: "ABCDEF123456",
      participant: parts.participant ?? undefined,
    },
    message: { conversation: "hello" },
    messageTimestamp:
      typeof stamp === "number"
        ? stamp
        : typeof stamp === "object" && stamp
          ? ((stamp as { low?: number }).low ?? 0)
          : 0,
    pushName: parts.pushName ?? undefined,
  };
}

/** The message as the sidecar builds it now. */
function conformedMessage(overrides: Parts): Record<string, unknown> {
  const parts = { ...DEFAULTS, ...overrides };
  return {
    key: {
      remoteJid: "213555123456@s.whatsapp.net",
      fromMe: false,
      id: "ABCDEF123456",
      participant: conformParticipant(parts.participant),
    },
    message: { conversation: "hello" },
    messageTimestamp: conformMessageTimestamp(parts.messageTimestamp),
    pushName: conformPushName(parts.pushName),
  };
}

const PARTICIPANTS: unknown[] = [
  undefined,
  null,
  "",
  "   ",
  "a".repeat(300),
  "213555000111@s.whatsapp.net",
  "  213555000111@s.whatsapp.net  ",
  `${"b".repeat(256)}  `,
];
const PUSH_NAMES: unknown[] = [
  undefined,
  null,
  "",
  "  ",
  "Amina",
  " Amina ",
  "p".repeat(256),
  "p".repeat(400),
  `${"a".repeat(255)}😀`,
];
const TIMESTAMPS: unknown[] = [
  1_792_341_426,
  1_792_341_426.7,
  { low: 1_792_341_426, high: 0, unsigned: false },
  { low: -2_147_483_648, high: 0, unsigned: false },
  "1792341426",
  -5,
  Number.NaN,
  null,
  undefined,
  {},
];

describe("inbound envelope contract with the app schema", () => {
  it("the app accepts every combination of odd provider values once conformed, at the source and at delivery", () => {
    let acceptedBefore = 0;
    let refusedBefore = 0;
    for (const participant of PARTICIPANTS) {
      for (const pushName of PUSH_NAMES) {
        for (const messageTimestamp of TIMESTAMPS) {
          const parts = { participant, pushName, messageTimestamp };
          const label = `participant=${JSON.stringify(participant)} pushName=${JSON.stringify(pushName)?.slice(0, 20)} timestamp=${JSON.stringify(messageTimestamp)}`;

          const before = whatsappInboundEnvelopeSchema.safeParse(
            wire(envelopeOf(legacyMessage(parts))),
          );
          const atSource = whatsappInboundEnvelopeSchema.safeParse(
            wire(envelopeOf(conformedMessage(parts))),
          );
          // A record an older sidecar queued: stored on disk, read back, then conformed on the way out.
          const queued = wire(legacyMessage(parts)) as IncomingMessage;
          const atDelivery = whatsappInboundEnvelopeSchema.safeParse(
            wire(envelopeOf(conformIncomingForApp(queued))),
          );

          expect(atSource.success, `source: ${label}`).toBe(true);
          expect(atDelivery.success, `delivery: ${label}`).toBe(true);

          if (before.success) {
            acceptedBefore += 1;
            // What the app already holds for this event must not change: it binds the
            // event to a hash of these stored values and refuses a replay that differs.
            expect(atSource.data, `source identity: ${label}`).toEqual(before.data);
            expect(atDelivery.data, `delivery identity: ${label}`).toEqual(before.data);
          } else {
            refusedBefore += 1;
          }
        }
      }
    }
    // Both branches really ran: some combinations were refused before, some accepted.
    expect(acceptedBefore).toBeGreaterThan(0);
    expect(refusedBefore).toBeGreaterThan(0);
  });

  it("canary: each of these values, sent unconformed, is refused by the app, so the test above can fail", () => {
    expect(
      whatsappInboundEnvelopeSchema.safeParse(wire(envelopeOf(legacyMessage({})))).success,
    ).toBe(true);
    const refused: Parts[] = [
      { participant: "" },
      { participant: "a".repeat(300) },
      { pushName: "p".repeat(400) },
      { messageTimestamp: 1_792_341_426.7 },
      { messageTimestamp: -5 },
      { messageTimestamp: { low: -2_147_483_648, high: 0 } },
    ];
    for (const overrides of refused) {
      const result = whatsappInboundEnvelopeSchema.safeParse(
        wire(envelopeOf(legacyMessage(overrides))),
      );
      expect(result.success, JSON.stringify(overrides)).toBe(false);
    }
  });

  it("the phone-outbound twin keeps the same three rules (it differs from the inbound schema only by fromMe)", () => {
    const twin = readFileSync(resolve(process.cwd(), "src/lib/whatsapp/phone-outbound.ts"), "utf8");
    const inbound = readFileSync(resolve(process.cwd(), "src/lib/whatsapp/inbound-ingress.ts"), "utf8");
    const shared = [
      "participant: z.string().trim().min(1).max(256).optional(),",
      "messageTimestamp: z.number().int().nonnegative(),",
      "pushName: z.string().trim().max(256).optional(),",
    ];
    for (const rule of [...shared, "fromMe: z.literal(true),"]) {
      expect(twin).toContain(rule);
    }
    for (const rule of [...shared, "fromMe: z.literal(false),"]) {
      expect(inbound).toContain(rule);
    }
  });

  it("the sidecar builds its envelope with the conforming helpers, sends queued records through them, and reports refused fields", () => {
    const manager = readFileSync(resolve(process.cwd(), "sidecars/whatsapp/whatsapp.ts"), "utf8");
    expect(manager).toContain("participant: conformParticipant(key.participant),");
    expect(manager).toContain("messageTimestamp: conformMessageTimestamp(m.messageTimestamp),");
    expect(manager).toContain("pushName: conformPushName(m.pushName),");
    expect(manager).not.toContain("(m.messageTimestamp as { low?: number }).low");
    const spool = readFileSync(resolve(process.cwd(), "sidecars/whatsapp/inbound-spool.ts"), "utf8");
    expect(spool).toContain("message: conformIncomingForApp(record.envelope.message),");
    expect(spool).toContain("rejectedFieldsOf(response.status, body),");
  });
});
