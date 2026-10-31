import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { postHeldDiscard } from "@/hooks/inbox/held-discard-client";
import { getHeldSendDiscardRuntimeTranslation } from "@/lib/i18n/held-send-discard-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const KEYS = [
  "whatsapp.heldSend.discard",
  "whatsapp.heldSend.discardTitle",
  "whatsapp.heldSend.discardBody",
  "whatsapp.heldSend.discarding",
  "whatsapp.heldSend.discarded",
  "whatsapp.heldSend.discardFailed",
  "whatsapp.heldSend.discardOwnerOnly",
  "whatsapp.heldSend.discardTooLate",
] as const;
const LOCALES = ["ar", "fr", "en"] as const;

describe("discard copy catalog", () => {
  it("has every key in ar, fr and en, filled, with no template left open", () => {
    for (const key of KEYS) {
      const seen = new Set<string>();
      for (const locale of LOCALES) {
        const text = getHeldSendDiscardRuntimeTranslation(locale, key);
        expect(text, `${locale} ${key}`).toBeTruthy();
        expect(text).not.toMatch(/\{\{|undefined|TODO/);
        seen.add(text as string);
      }
      expect(seen.size, `${key} must differ per language`).toBe(3);
    }
  });

  it("Arabic is Arabic script, French has no English leftovers of the key words", () => {
    for (const key of KEYS) {
      expect(getHeldSendDiscardRuntimeTranslation("ar", key)).toMatch(/[\u0600-\u06FF]/);
      expect(getHeldSendDiscardRuntimeTranslation("fr", key)).not.toMatch(/\b(discard|message will)\b/i);
    }
  });

  it("the dialog sentence is exactly the Founder's wording in English", () => {
    expect(getHeldSendDiscardRuntimeTranslation("en", "whatsapp.heldSend.discardBody")).toBe(
      "This message will not be sent to this chat. The other chats are not affected.",
    );
  });

  it("is reachable through the app's runtime lookup in every language", () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(getRuntimeTranslation(locale, key)).toBe(getHeldSendDiscardRuntimeTranslation(locale, key));
      }
      // The approve copy still resolves (the new lookup did not shadow it).
      expect(getRuntimeTranslation(locale, "whatsapp.heldSend.approve")).toBeTruthy();
    }
  });
});

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe("postHeldDiscard", () => {
  it("POSTs the encoded effect key to the discard route and reads the answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, alreadyDiscarded: false, effect: { state: "dead_letter", errorCode: "SEND_GUARD_BULK_SAME_TEXT" } }),
    );
    const result = await postHeldDiscard("wa:a/b c", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/whatsapp/outbox/wa%3Aa%2Fb%20c/discard-held");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(result).toEqual({ ok: true, alreadyDiscarded: false });
  });

  it("a repeat is ok with alreadyDiscarded true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, alreadyDiscarded: true }));
    expect(await postHeldDiscard("k", fetchImpl as unknown as typeof fetch)).toEqual({ ok: true, alreadyDiscarded: true });
  });

  it("keeps the status and code of a refusal", async () => {
    const owner = vi.fn().mockResolvedValue(jsonResponse(403, { code: "HELD_SEND_OWNER_ONLY", error: "no" }));
    expect(await postHeldDiscard("k", owner as unknown as typeof fetch)).toEqual({ ok: false, status: 403, code: "HELD_SEND_OWNER_ONLY", message: "no" });
    const conflict = vi.fn().mockResolvedValue(jsonResponse(409, { code: "CONFLICT", error: "x" }));
    expect(await postHeldDiscard("k", conflict as unknown as typeof fetch)).toMatchObject({ ok: false, status: 409 });
  });

  it("never throws: a dead network and a non-JSON body are plain failures", async () => {
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await postHeldDiscard("k", down as unknown as typeof fetch)).toEqual({ ok: false, status: 0, code: null, message: null });
    const html = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("not json"); } });
    expect(await postHeldDiscard("k", html as unknown as typeof fetch)).toMatchObject({ ok: false, status: 502, code: null });
  });

  it("a 200 without the ok flag is not trusted as a discard", async () => {
    const odd = vi.fn().mockResolvedValue(jsonResponse(200, { something: "else" }));
    expect(await postHeldDiscard("k", odd as unknown as typeof fetch)).toMatchObject({ ok: false });
  });
});

describe("the hook exposes the discard action", () => {
  const source = readFileSync(path.join(process.cwd(), "src/hooks/inbox/use-inbox-outbox.ts"), "utf8");
  it("asks first, posts once, and hands the thread what it needs", () => {
    expect(source).toContain("postHeldDiscard");
    for (const name of ["discardHeldMessage", "heldDiscardMessage", "resolveHeldDiscard", "heldDiscardStatus"]) {
      expect(source, name).toContain(name);
    }
    expect(source).toContain("whatsapp.heldSend.discardFailed");
    expect(source).toContain("whatsapp.heldSend.discardOwnerOnly");
    expect(source).toContain("whatsapp.heldSend.discardTooLate");
  });
});
