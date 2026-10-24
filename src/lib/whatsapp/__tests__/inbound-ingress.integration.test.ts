process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { createHash } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
} from "@/lib/business-truth/result-codec";
import { db, shopContext } from "@/lib/db";
import { ConflictError } from "@/types/errors";
import { hashWhatsAppAccountId } from "../../../../sidecars/whatsapp/auth-tokens";
import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};

function envelope(overrides?: {
  spoolId?: string;
  receivedAt?: string;
  text?: string;
  accountId?: string;
}): WhatsAppInboundEnvelope {
  return {
    spoolId: overrides?.spoolId ?? "a".repeat(64),
    accountId: overrides?.accountId ?? ACCOUNT_ID,
    receivedAt: overrides?.receivedAt ?? "2026-08-03T09:30:00.000Z",
    message: {
      key: {
        remoteJid: "213555000111@s.whatsapp.net",
        fromMe: false,
        id: "PROVIDER-INBOUND-1",
      },
      message: { conversation: overrides?.text ?? "Bonjour secret client" },
      messageTimestamp: 1_786_000_000,
      pushName: "Client secret",
    },
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

// The content hash for a given account string, written out independently of
// the code under test. Builds before the relink fix hashed the raw account id.
function contentHash(accountId: string, message: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        sortKeys({
          provider: "whatsapp",
          environment: "whatsapp-web",
          eventType: "message.upsert",
          accountId,
          message,
        }),
      ),
    )
    .digest("hex");
}

// Stores a row exactly as an earlier build did: payloadHash (column and seal)
// over the raw account id, including its device index.
async function storeLegacyRow(
  env: WhatsAppInboundEnvelope,
): Promise<{ id: string; legacyHash: string }> {
  const stored = await persistWhatsAppInbound(
    { ...context, whatsAppProviderAccountId: env.accountId },
    env,
  );
  const row = await db.providerIngressEvent.findUniqueOrThrow({
    where: { id: stored.ingressEventId },
  });
  const legacyHash = contentHash(env.accountId, env.message);
  const payloadJson = sealBusinessCommandResultWithKey(
    {
      provider: "whatsapp",
      environment: "whatsapp-web",
      eventType: "message.upsert",
      accountId: env.accountId,
      message: env.message,
      spoolId: env.spoolId,
      receivedAt: env.receivedAt,
    },
    {
      commandId: row.id,
      idempotencyKey: `provider-ingress:${row.ingressKey}`,
      requestHash: legacyHash,
    },
    await getBusinessEnvelopeKey(context),
  ).resultJson;
  await db.providerIngressEvent.update({
    where: { id: row.id },
    data: { payloadHash: legacyHash, payloadJson },
  });
  return { id: row.id, legacyHash };
}

const RELINKED_ACCOUNT_ID = "213555999000:5@s.whatsapp.net";
const relinkedContext = {
  ...context,
  whatsAppProviderAccountId: RELINKED_ACCOUNT_ID,
};

async function clean(): Promise<void> {
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("durable WhatsApp inbound ingress", () => {
  it("commits encrypted provider evidence before acknowledging the sidecar", async () => {
    const result = await persistWhatsAppInbound(context, envelope());

    expect(result).toMatchObject({ status: "received", replayed: false });
    const stored = await db.providerIngressEvent.findUniqueOrThrow({
      where: { id: result.ingressEventId },
    });
    expect(stored.ingressKey).toMatch(/^wa-in:[0-9a-f]{32}:[0-9a-f]{64}:[0-9a-f]{64}$/);
    expect(stored.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.payloadJson).not.toContain("Bonjour secret client");
    expect(stored.payloadJson).not.toContain("Client secret");
    expect(stored.payloadJson).not.toContain("213555000111");
    expect(stored.payloadJson).not.toContain("213555999000");
    expect(stored.providerTimestamp?.toISOString()).toBe(
      new Date(1_786_000_000 * 1_000).toISOString(),
    );
  });

  it("replays the same provider event even when sidecar-local metadata changes", async () => {
    const first = await persistWhatsAppInbound(context, envelope());
    const replay = await persistWhatsAppInbound(
      context,
      envelope({
        spoolId: "b".repeat(64),
        receivedAt: "2026-08-03T10:30:00.000Z",
      }),
    );

    expect(replay).toEqual({
      ingressEventId: first.ingressEventId,
      ingressKey: first.ingressKey,
      status: "received",
      replayed: true,
    });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("rejects changed provider content under the same provider identity", async () => {
    await persistWhatsAppInbound(context, envelope());

    await expect(
      persistWhatsAppInbound(context, envelope({ text: "Changed content" })),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("rejects a message from a different paired WhatsApp account", async () => {
    await expect(
      persistWhatsAppInbound(
        context,
        envelope({ accountId: "213555888000:14@s.whatsapp.net" }),
      ),
    ).rejects.toThrow(/different paired account/i);
    await expect(db.providerIngressEvent.count()).resolves.toBe(0);
  });

  it("accepts a record spooled under an earlier device index of the same paired number", async () => {
    // After a relink the same number answers with a new device index. A
    // record spooled before it must still land, under the same account hash.
    const result = await persistWhatsAppInbound(
      context,
      envelope({ accountId: "213555999000:5@s.whatsapp.net" }),
    );

    expect(result.replayed).toBe(false);
    const stored = await db.providerIngressEvent.findUniqueOrThrow({
      where: { id: result.ingressEventId },
    });
    expect(stored.providerAccountHash).toBe(hashWhatsAppAccountId(ACCOUNT_ID));
  });

  it("still rejects another number that happens to use the paired device index", async () => {
    await expect(
      persistWhatsAppInbound(
        context,
        envelope({ accountId: "213555888000:12@s.whatsapp.net" }),
      ),
    ).rejects.toThrow(/different paired account/i);
    await expect(db.providerIngressEvent.count()).resolves.toBe(0);
  });

  describe("after a relink to a new device index", () => {
    it("accepts a record stored with the earlier raw-account hash as the same record", async () => {
      const { id, legacyHash } = await storeLegacyRow(envelope());

      const again = await persistWhatsAppInbound(
        relinkedContext,
        envelope({ accountId: RELINKED_ACCOUNT_ID, spoolId: "b".repeat(64) }),
      );

      expect(again.replayed).toBe(true);
      expect(again.ingressEventId).toBe(id);
      await expect(db.providerIngressEvent.count()).resolves.toBe(1);
      // An existing row is never rewritten to the new form.
      const row = await db.providerIngressEvent.findUniqueOrThrow({
        where: { id },
      });
      expect(row.payloadHash).toBe(legacyHash);
    });

    it("accepts a record stored with the earlier hash when the device index did not change", async () => {
      const { id } = await storeLegacyRow(envelope());

      const again = await persistWhatsAppInbound(
        context,
        envelope({ spoolId: "b".repeat(64) }),
      );

      expect(again.replayed).toBe(true);
      expect(again.ingressEventId).toBe(id);
    });

    it("accepts a record stored in the new form when it is delivered again", async () => {
      const first = await persistWhatsAppInbound(context, envelope());

      const again = await persistWhatsAppInbound(
        relinkedContext,
        envelope({ accountId: RELINKED_ACCOUNT_ID, spoolId: "b".repeat(64) }),
      );

      expect(again.replayed).toBe(true);
      expect(again.ingressEventId).toBe(first.ingressEventId);
      await expect(db.providerIngressEvent.count()).resolves.toBe(1);
    });

    it("still refuses different content under the same key (earlier hash)", async () => {
      await storeLegacyRow(envelope());

      await expect(
        persistWhatsAppInbound(
          relinkedContext,
          envelope({ accountId: RELINKED_ACCOUNT_ID, text: "Changed content" }),
        ),
      ).rejects.toThrow(/already bound to different content/i);
      await expect(db.providerIngressEvent.count()).resolves.toBe(1);
    });

    it("still refuses different content under the same key (new form)", async () => {
      await persistWhatsAppInbound(context, envelope());

      await expect(
        persistWhatsAppInbound(
          relinkedContext,
          envelope({ accountId: RELINKED_ACCOUNT_ID, text: "Changed content" }),
        ),
      ).rejects.toThrow(/already bound to different content/i);
      await expect(db.providerIngressEvent.count()).resolves.toBe(1);
    });

    it("still refuses a different number", async () => {
      await storeLegacyRow(envelope());

      await expect(
        persistWhatsAppInbound(
          relinkedContext,
          envelope({ accountId: "213555888000:5@s.whatsapp.net" }),
        ),
      ).rejects.toThrow(/different paired account/i);
      await expect(db.providerIngressEvent.count()).resolves.toBe(1);
    });
  });

  it("stores new rows with the hash of the normalized number, whatever the device index", async () => {
    const first = await persistWhatsAppInbound(context, envelope());
    await clean();
    const second = await persistWhatsAppInbound(
      relinkedContext,
      envelope({ accountId: RELINKED_ACCOUNT_ID }),
    );

    const expected = contentHash("213555999000", envelope().message);
    const row = await db.providerIngressEvent.findUniqueOrThrow({
      where: { id: second.ingressEventId },
    });
    expect(row.payloadHash).toBe(expected);
    // Same message, same key, whichever device index delivered it.
    expect(first.ingressKey).toBe(second.ingressKey);
    const sealed = openBusinessCommandResultWithKey<{ accountId: string }>(
      row.payloadJson,
      {
        commandId: row.id,
        idempotencyKey: `provider-ingress:${row.ingressKey}`,
        requestHash: row.payloadHash,
      },
      await getBusinessEnvelopeKey(context),
    );
    // The sealed evidence keeps the account id exactly as the sidecar sent it.
    expect(sealed.accountId).toBe(RELINKED_ACCOUNT_ID);
  });

  it("converges concurrent duplicate deliveries onto one stored ingress event", async () => {
    const [left, right] = await Promise.all([
      persistWhatsAppInbound(context, envelope()),
      persistWhatsAppInbound(context, envelope()),
    ]);

    expect(left.ingressEventId).toBe(right.ingressEventId);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });
});
