import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// Pins that the liveness work stays MEASUREMENT ONLY. A wrong automatic
// reconnect on the Inbox's transport (or a reconnect storm against an
// unofficial provider) is worse than a missing sample, so recovery must be a
// separate, evidence-led change.
describe("WhatsApp liveness evidence", () => {
  const manager = read("sidecars/whatsapp/whatsapp.ts");
  const start = manager.indexOf("private startLiveness(");
  const end = manager.indexOf("private scheduleReconnectWatchdog(");
  const liveness = manager.slice(start, end);

  it("is wired to the socket's open, close and logout", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(manager).toContain("this.startLiveness(this.sock");
    expect(manager).toContain('diagnostics.record("session.state"');
    const closeBranch = manager.slice(
      manager.indexOf('if (connection === "close") {'),
      manager.indexOf("const shouldReconnect ="),
    );
    expect(closeBranch).toContain("this.stopLiveness()");
    const logout = manager.slice(
      manager.indexOf("async logout(): Promise<void> {"),
      manager.indexOf("async logout(): Promise<void> {") + 200,
    );
    expect(logout).toContain("this.stopLiveness()");
  });

  it("records what distinguishes quiet, buffering and deaf", () => {
    expect(liveness).toContain('"frame"');
    expect(liveness).toContain("isBuffering");
    expect(liveness).toContain("onWhatsApp");
    expect(liveness).toContain('diagnostics.record("liveness"');
    expect(liveness).toContain("appStateKey");
    expect(manager).toContain("this.liveness?.noteUpserts(messages.length)");
  });

  it("never reconnects, flushes, closes or logs out from the liveness code", () => {
    for (const forbidden of [
      ".end(",
      ".close(",
      ".logout(",
      ".flush(",
      ".buffer(",
      "this.connect(",
      "scheduleReconnectWatchdog(",
      "process.exit",
    ]) {
      expect(liveness, forbidden).not.toContain(forbidden);
    }
  });

  it("never records an identity, a key or a message", () => {
    const records = liveness.match(/diagnostics\.record\([^;]*\);/gs) ?? [];
    expect(records.length).toBeGreaterThan(0);
    for (const call of records) {
      expect(call).not.toMatch(/\b(ownId|jid|myAppStateKeyId|pushName|body|text)\b/);
    }
  });

  it("is quiet when the socket is not connected and cannot overlap itself", () => {
    expect(liveness).toContain('this.status !== "connected"');
    expect(liveness).toContain("livenessProbeInFlight");
    expect(liveness).toContain(".unref?.()");
  });
});
