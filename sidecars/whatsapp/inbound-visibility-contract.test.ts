import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// Inbound WhatsApp messages are the product's lifeblood. On 2026-10-17 a
// seller reported that new messages did not land in the Inbox, and the
// diagnostics file held no inbound line of any kind, so the cause could not be
// found. Every place a provider message can leave the pipeline must now leave a
// trace (counts and reasons only: never a JID, a number or a message body).
describe("inbound WhatsApp visibility", () => {
  const sidecar = read("sidecars/whatsapp/index.ts");
  const gate = read("sidecars/whatsapp/inbound-subscriber.ts");
  const manager = read("sidecars/whatsapp/whatsapp.ts");
  const spool = read("sidecars/whatsapp/inbound-spool.ts");

  it("records every silent drop in the sidecar subscriber", () => {
    // The gate lives in its own module so it can be tested; index.ts must use it.
    expect(sidecar).toContain("createInboundSubscriber({");
    const subscriber = gate;
    expect(subscriber).toContain('reason: "non-individual-jid"');
    expect(subscriber).toContain('reason: "no-paired-account"');
    expect(subscriber).toContain('diagnostics.record("inbound.spool-failed"');
    // Only the part after the "@" is kept, never the identity.
    expect(subscriber).toContain('split("@")[1]');
    expect(subscriber).not.toMatch(/diagnostics\.record\([^)]*remoteJid\s*[,}]/);
  });

  it("records what the provider delivered and when its offline backlog ended", () => {
    expect(manager).toContain('diagnostics.record("inbound.upsert"');
    expect(manager).toContain("receivedPendingNotifications");
    expect(manager).toContain('diagnostics.record("connection.update"');
  });

  it("records spooling, delivery failure and the committed outcome", () => {
    for (const event of [
      "inbound.spooled",
      "inbound.delivery-failed",
      "inbound.committed",
    ]) {
      expect(spool).toContain(`diagnostics.record("${event}"`);
    }
  });

  it("never passes a message body or an identity to the diagnostics file", () => {
    for (const source of [sidecar, gate, manager, spool]) {
      for (const call of source.match(/diagnostics\.record\([^;]*\);/gs) ?? []) {
        expect(call).not.toMatch(/\b(body|text|conversation|caption|pushName)\b\s*[:,}]/);
      }
    }
  });
});
