import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldUnarchiveOnInboundMessage } from "../inbound-processor";

// Audit MSG-06 (INB-12): a new customer message in an ARCHIVED thread used to
// increment unread and reopen the status while the row stayed archived, so it
// was invisible in every main queue. The decision is a pure function so it
// can be proven without a database; the database-backed proof is in
// inbound-processor.integration.test.ts (CI).

const AT = new Date("2026-10-17T12:00:00.000Z");
const ARCHIVED = new Date("2026-10-01T09:00:00.000Z");
const HOUR = 60 * 60 * 1_000;

describe("shouldUnarchiveOnInboundMessage", () => {
  it("brings an archived, unmuted thread back when the customer writes", () => {
    expect(
      shouldUnarchiveOnInboundMessage({
        archivedAt: ARCHIVED,
        mutedUntil: null,
        fromMe: false,
        at: AT,
      }),
    ).toBe(true);
  });

  it("keeps an archived thread archived while it is muted", () => {
    expect(
      shouldUnarchiveOnInboundMessage({
        archivedAt: ARCHIVED,
        mutedUntil: new Date(AT.getTime() + HOUR),
        fromMe: false,
        at: AT,
      }),
    ).toBe(false);
  });

  it("treats an expired mute as unmuted, exactly like the Inbox list does", () => {
    expect(
      shouldUnarchiveOnInboundMessage({
        archivedAt: ARCHIVED,
        mutedUntil: new Date(AT.getTime() - HOUR),
        fromMe: false,
        at: AT,
      }),
    ).toBe(true);
    // The list reads `mutedUntil > now` as muted, so the boundary is unmuted.
    expect(
      shouldUnarchiveOnInboundMessage({
        archivedAt: ARCHIVED,
        mutedUntil: new Date(AT.getTime()),
        fromMe: false,
        at: AT,
      }),
    ).toBe(true);
  });

  it("never changes anything for a message the seller sent (fromMe)", () => {
    for (const mutedUntil of [null, new Date(AT.getTime() + HOUR)]) {
      expect(
        shouldUnarchiveOnInboundMessage({
          archivedAt: ARCHIVED,
          mutedUntil,
          fromMe: true,
          at: AT,
        }),
      ).toBe(false);
    }
  });

  it("has nothing to do for a thread that is not archived", () => {
    for (const mutedUntil of [null, new Date(AT.getTime() + HOUR)]) {
      expect(
        shouldUnarchiveOnInboundMessage({
          archivedAt: null,
          mutedUntil,
          fromMe: false,
          at: AT,
        }),
      ).toBe(false);
    }
  });

  it("treats a missing conversation row (first message) as nothing to unarchive", () => {
    expect(
      shouldUnarchiveOnInboundMessage({
        archivedAt: undefined,
        mutedUntil: undefined,
        fromMe: false,
        at: AT,
      }),
    ).toBe(false);
  });
});

describe("inbound processor wiring", () => {
  // The database-backed proof runs in CI (inbound-processor.integration.test.ts).
  // This pin shows locally that the update branch really consults the helper.
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/whatsapp/inbound-processor.ts"),
    "utf8",
  );
  const upsertAt = source.indexOf("tx.conversation.upsert({");

  it("reads the archive and mute state before it upserts the conversation", () => {
    const decision = source.indexOf("shouldUnarchiveOnInboundMessage({");
    expect(decision).toBeGreaterThan(-1);
    expect(upsertAt).toBeGreaterThan(decision);
    const read = source.slice(0, upsertAt);
    expect(read).toContain("select: { archivedAt: true, mutedUntil: true }");
    expect(read).toContain("fromMe: input.message.key.fromMe");
  });

  it("clears archivedAt in the update branch only when the helper says so", () => {
    const update = source.slice(source.indexOf("update: {", upsertAt));
    const branch = update.slice(0, update.indexOf("select: { id: true }"));
    expect(branch).toContain("...(unarchive ? { archivedAt: null } : {})");
    // The create branch of a brand-new thread has nothing to clear.
    const create = source.slice(upsertAt, source.indexOf("update: {", upsertAt));
    expect(create).not.toContain("archivedAt");
  });
});
