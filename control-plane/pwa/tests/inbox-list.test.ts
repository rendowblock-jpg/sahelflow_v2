// W3-F5 step 1: the conversation list. Written BEFORE the code.
import { describe, expect, it } from "vitest";
import { renderInboxList } from "../src/views/inbox/list";
import { sortConversations } from "../src/views/inbox/model";
import { NOW, anon, conv, iso, mk, msg, proj, rowIds } from "./inbox-fixtures";

const held = conv({ id: "h", unread: 0, lastAt: iso(NOW - 5 * 3_600_000), messages: [msg({ id: "h1", direction: "out", held: true, deliveryStatus: "held" })] });
const u1 = conv({ id: "u1", unread: 1, lastAt: iso(NOW - 3_600_000) });
const u2 = conv({ id: "u2", unread: 3, lastAt: iso(NOW - 2 * 3_600_000) });
const plain = conv({ id: "p", unread: 0, lastAt: iso(NOW - 60_000), messages: [msg({ id: "p1", direction: "out" })] });

describe("order of the list", () => {
  it("held first, then unread, then newest first (whatever order the projection came in)", () => {
    expect(rowIds(renderInboxList(mk({ data: proj([plain, u2, held, u1]) })))).toEqual(["h", "u1", "u2", "p"]);
    expect(sortConversations([plain, u2, held, u1]).map((c) => c.id)).toEqual(["h", "u1", "u2", "p"]);
  });
  it("is stable for conversations that tie", () => {
    const a = conv({ id: "a", unread: 0, lastAt: iso(NOW) }); const b = conv({ id: "b", unread: 0, lastAt: iso(NOW) });
    expect(sortConversations([a, b]).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("a row", () => {
  it("shows name, last message, time, unread count (words, not colour only)", () => {
    const html = renderInboxList(mk());
    expect(html).toContain("<bdi>Amina B.</bdi>"); expect(html).toContain("Et la taille M ?");
    expect(html).toContain('<span class="when num" dir="ltr">09:00</span>');
    expect(html).toContain('<span class="unread num" dir="ltr" aria-label="2 unread">2</span>');
    expect(html).toContain('class="num phone" dir="ltr">0550123456<');
  });
  it("the unread count uses the kit formatter (thin space thousands), no unread badge at 0", () => {
    expect(renderInboxList(mk({ data: proj([conv({ unread: 1234 })]) }))).toContain("1\u00A0234");
    expect(renderInboxList(mk({ data: proj([conv({ unread: 0 })]) }))).not.toContain('class="unread');
  });
  it("cuts the snippet at 80 characters, with an ellipsis, and not at 80 exactly", () => {
    const long = renderInboxList(mk({ data: proj([conv({ messages: [msg({ text: "a".repeat(100) })] })]) }));
    expect(long).toContain(`>${"a".repeat(80)}…<`); expect(long).not.toContain("a".repeat(81));
    expect(renderInboxList(mk({ data: proj([conv({ messages: [msg({ text: "b".repeat(80) })] })]) }))).toContain(`>${"b".repeat(80)}<`);
  });
  it("an attachment shows its placeholder word, never a url", () => {
    const img = renderInboxList(mk({ data: proj([conv({ messages: [msg({ type: "image", text: "https://cdn.example/x.jpg" })] })]) }));
    expect(img).toContain(">Photo<"); expect(img).not.toContain("https://");
    expect(renderInboxList(mk({ data: proj([conv({ messages: [msg({ type: "audio", text: "" })] })]) }))).toContain(">Voice<");
  });
  it("wears the held badge only when a message is held", () => {
    const html = renderInboxList(mk({ data: proj([held, u1]) }));
    expect((html.match(/Held on your PC/g) ?? []).length).toBe(1);
    expect(html).toMatch(/data-id="h"[\s\S]*?class="held-badge">Held on your PC</);
  });
  it("older than a day shows the weekday, not the time", () => {
    const html = renderInboxList(mk({ data: proj([conv({ lastAt: iso(NOW - 3 * 86_400_000) })]) }));
    expect(html).toContain(">Wed<"); expect(html).not.toContain(">09:00<");
  });
  it("without contact shows Customer and no number, and never leaks undefined or null", () => {
    const html = renderInboxList(mk({ data: proj([anon(conv())]) }));
    expect(html).toContain("<bdi>Customer</bdi>"); expect(html).not.toContain('class="num phone"'); expect(html).not.toMatch(/undefined|null|NaN/);
    expect(renderInboxList(mk({ data: proj([conv({ contactName: "" })]) }))).toContain("<bdi>Customer</bdi>");
  });
  it("escapes what the customer wrote", () => {
    const html = renderInboxList(mk({ data: proj([conv({ contactName: "<img src=x onerror=1>", messages: [msg({ text: "<script>alert(1)</script>" })] })]) }));
    expect(html).not.toContain("<img"); expect(html).not.toContain("<script"); expect(html).toContain("&lt;script&gt;");
  });
  it("opens the chat by id, and carries no customer text in the document title", () => {
    const html = renderInboxList(mk());
    expect(html).toContain('data-act="open-chat" data-id="c1"'); expect(html).not.toContain("<title");
  });
});

describe("states", () => {
  it("loading = 8 skeleton rows, never an invented empty list", () => {
    const html = renderInboxList(mk({ read: "loading", data: null, asOf: null }));
    expect((html.match(/<i><\/i>/g) ?? []).length).toBe(8); expect(html).not.toContain("No conversations");
  });
  it("empty says so", () => expect(renderInboxList(mk({ data: proj([]) }))).toContain("No conversations to answer"));
  it("error keeps the last copy and offers Retry", () => {
    const html = renderInboxList(mk({ read: "error" }));
    expect(html).toContain("Could not load your conversations."); expect(html).toContain('data-act="inbox-retry"'); expect(rowIds(html)).toEqual(["c1"]);
    const none = renderInboxList(mk({ read: "error", data: null, asOf: null }));
    expect(none).toContain('role="alert"'); expect(none).toContain('data-act="inbox-retry"'); expect(none).not.toContain("<i></i>");
  });
  it("old copy, PC off, expired and offline are said with a strip", () => {
    expect(renderInboxList(mk({ asOf: NOW - 2 * 3_600_000 }))).toContain('data-state="stale"');
    expect(renderInboxList(mk({ pcOff: true }))).toContain('data-state="pcoff"');
    const exp = renderInboxList(mk({ asOf: NOW - 25 * 3_600_000 }));
    expect(exp).toContain('data-state="expired"'); expect(exp).toContain("more than 24 hours old");
    expect(renderInboxList(mk({ online: false }))).toContain("No connection. The app shows what is saved.");
    expect(renderInboxList(mk())).toContain('data-state="fresh"');
  });
  it("the window sentence appears at 20 conversations, not before", () => {
    const many = Array.from({ length: 20 }, (_, i) => conv({ id: `x${i}` }));
    expect(renderInboxList(mk({ data: proj(many) }))).toContain("Latest 20 conversations");
    expect(renderInboxList(mk({ data: proj(many.slice(0, 19)) }))).not.toContain("Latest 20 conversations");
  });
});
