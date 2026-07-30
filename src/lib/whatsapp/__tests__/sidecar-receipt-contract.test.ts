import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  effectKeyMatchesWhatsAppAccount,
  getWhatsAppEffectAccountHash,
  hashWhatsAppAccountId,
} from "../../../../sidecars/whatsapp/auth-tokens";
import {
  createDurableSendReceiptJournal,
  deterministicWhatsAppMessageId,
} from "../../../../sidecars/whatsapp/send-receipts";
import type { ShopContext } from "@/lib/shops/context";
import { deriveWhatsAppEffectAuthority } from "../effect-authority";

const envelopeKey = Buffer.from("11".repeat(32), "hex");
const providerAccountId = "213555999000:12@s.whatsapp.net";
const shop: ShopContext = Object.freeze({
  workspaceId: "10".repeat(16),
  installationId: "20".repeat(16),
  shopId: "shop-a",
  shopIncarnationId: "30".repeat(16),
  registryRevision: 7,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "40".repeat(32),
});

function derive(
  overrides: Partial<ShopContext> = {},
  accountId = providerAccountId,
) {
  return deriveWhatsAppEffectAuthority(
    Object.freeze({ ...shop, ...overrides }),
    envelopeKey,
    accountId,
    "text",
    "11111111-1111-4111-8111-111111111111",
    "213555000111@s.whatsapp.net",
    "private customer message",
  );
}

describe("WhatsApp sidecar receipt identity", () => {
  it("derives a stable provider message ID from the durable effect key", () => {
    const first = deterministicWhatsAppMessageId("wa:scope-a:text:effect-1");
    const replay = deterministicWhatsAppMessageId("wa:scope-a:text:effect-1");
    const other = deterministicWhatsAppMessageId("wa:scope-b:text:effect-1");
    expect(first).toBe(replay);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[0-9A-F]{20}$/);
  });

  it("derives stable opaque identity without recipient, message or account plaintext", () => {
    const authority = derive();
    expect(authority.effectKey).toMatch(
      /^wa:[0-9a-f]{32}:[0-9a-f]{64}:text:/,
    );
    expect(authority.requestBinding).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(authority)).not.toContain("213555000111");
    expect(JSON.stringify(authority)).not.toContain("private customer message");
    expect(JSON.stringify(authority)).not.toContain("213555999000");
    expect(getWhatsAppEffectAccountHash(authority.effectKey)).toBe(
      hashWhatsAppAccountId(providerAccountId),
    );
    expect(effectKeyMatchesWhatsAppAccount(
      authority.effectKey,
      "213555999000@s.whatsapp.net",
    )).toBe(true);
    expect(authority.requestBinding).not.toBe(
      deriveWhatsAppEffectAuthority(
        shop,
        envelopeKey,
        providerAccountId,
        "text",
        "11111111-1111-4111-8111-111111111111",
        "213555000111@s.whatsapp.net",
        "different content",
      ).requestBinding,
    );
  });

  it("scopes the same local effect to installation, workspace, shop, incarnation and account", () => {
    const baseline = derive();
    for (const other of [
      derive({ workspaceId: "51".repeat(16) }),
      derive({ installationId: "52".repeat(16) }),
      derive({ shopId: "shop-b" }),
      derive({ shopIncarnationId: "53".repeat(16) }),
      derive({}, "213555888000@s.whatsapp.net"),
    ]) {
      expect(other.effectKey).not.toBe(baseline.effectKey);
      expect(other.requestBinding).not.toBe(baseline.requestBinding);
    }
    expect(effectKeyMatchesWhatsAppAccount(
      baseline.effectKey,
      "213555888000@s.whatsapp.net",
    )).toBe(false);
  });

  it("reconciles a durable receipt after a sidecar-token rotation and restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-receipts-"));
    const receiptFile = join(directory, "receipts.json");
    const authority = deriveWhatsAppEffectAuthority(
      shop,
      envelopeKey,
      providerAccountId,
      "text",
      "22222222-2222-4222-8222-222222222222",
      "213555000111@s.whatsapp.net",
      "restart-safe message",
    );
    const previousToken = process.env.SIDECAR_TOKEN;
    try {
      process.env.SIDECAR_TOKEN = "launch-token-a-0123456789";
      const firstLaunch = createDurableSendReceiptJournal(receiptFile);
      firstLaunch.record(authority.effectKey, {
        requestBinding: authority.requestBinding,
        id: "WA-RESTART-1",
        status: "sent",
        completedAt: "2026-07-30T12:00:00.000Z",
      });

      process.env.SIDECAR_TOKEN = "launch-token-b-9876543210";
      const restartedSidecar = createDurableSendReceiptJournal(receiptFile);
      expect(
        restartedSidecar.find(authority.effectKey, authority.requestBinding),
      ).toMatchObject({ id: "WA-RESTART-1", status: "sent" });
      expect(() =>
        restartedSidecar.find(authority.effectKey, "ff".repeat(32)),
      ).toThrow(/different content/i);
    } finally {
      if (previousToken === undefined) delete process.env.SIDECAR_TOKEN;
      else process.env.SIDECAR_TOKEN = previousToken;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
