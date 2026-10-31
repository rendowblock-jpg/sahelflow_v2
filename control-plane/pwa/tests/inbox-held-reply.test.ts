// W3b F6a-2: the reply area of a chat that has a HELD message. The composer stays usable, the phone says the earlier message waits
// for the owner's OK on the PC, and a TRUE "already answered" still has no button. Records come from the real outbox reducer.
import { describe, expect, it } from "vitest";
import { transition } from "../src/outbox/state";
import { renderReplyArea } from "../src/views/inbox/reply";
import { NOW, conv, iso, mk, msg, proj, reply } from "./inbox-fixtures";

const SENTENCE = "Your earlier message is waiting for your OK on your PC.";
const held = (isHeld: boolean) => conv({ messages: [msg({ id: "m1" }), msg({ id: "m2", direction: "out", text: "Un instant", deliveryStatus: isHeld ? "held" : "sent", held: isHeld, at: iso(NOW - 1_800_000) })] });
const area = (c = held(true), o: Parameters<typeof mk>[0] = {}): string => renderReplyArea(mk({ data: proj([c]), openId: c.id, ...o }), c);
const chipOf = (html: string): string => html.match(/<div class="chip[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
const answered = (outcome: "failed" | "committed") => transition(reply({ state: "sent" }), { type: "result", at: NOW, outcome, code: "ALREADY_ANSWERED" });

describe("a chat with a held message", () => {
  it("says the earlier message waits for the OK on the PC, and the composer stays usable", () => {
    const html = area();
    expect(html).toContain(`<p class="hint" role="status" data-held-reply>${SENTENCE}</p>`);
    expect(html).not.toContain(" disabled");
    expect(html).toContain('data-form="composer"');
  });
  it("says nothing when no message of the chat is held (approved, or never held)", () => {
    expect(area(held(false))).not.toContain(SENTENCE);
    expect(area(conv())).not.toContain("data-held-reply");
  });
  it("is written in French and Arabic too", () => {
    expect(area(held(true), { locale: "fr" })).toContain("Votre message précédent attend votre accord sur votre PC.");
    expect(area(held(true), { locale: "ar" })).toContain("رسالتك السابقة تنتظر موافقتك على حاسوبك.");
  });
  it("a reply the PC took in is handed over (committed), never 'already answered' and never 'delivered'; the sentence stays", () => {
    const html = area(held(true), { commands: [transition(reply({ state: "sent" }), { type: "result", at: NOW, outcome: "committed" })] });
    expect(chipOf(html)).toContain('data-state="committed"');
    expect(chipOf(html)).not.toMatch(/Already answered|delivered/i);
    expect(html).toContain(SENTENCE);
  });
  it.each(["failed", "committed"] as const)("a TRUE ALREADY_ANSWERED (%s) says answered, with NO button of any kind, and not the held sentence in the chip", (outcome) => {
    const rec = answered(outcome);
    expect(rec.resultCode).toBe("ALREADY_ANSWERED");
    const chip = chipOf(area(held(true), { commands: [rec] }));
    expect(chip).toContain("Already answered");
    expect(chip).not.toContain(SENTENCE);
    expect(chip).not.toContain("<button");
    expect(area(held(true), { commands: [rec] })).not.toMatch(/send-anyway|cmd-retry|data-act="(?!reply)/);
  });
});
