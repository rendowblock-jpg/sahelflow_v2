// W3-F5 step 2: the conversation (bubbles, ticks, held, media, truncated, states). Written BEFORE the code.
import { describe, expect, it } from "vitest";
import { renderThread } from "../src/views/inbox/thread";
import { anon, bubble, bubbleIds, conv, mk, msg, proj, reply } from "./inbox-fixtures";

const open = (c = conv(), o: Parameters<typeof mk>[0] = {}) => mk({ data: proj([c]), openId: c.id, seen: c, ...o });

describe("bubbles", () => {
  it("oldest first, in vs out by direction, each bubble dir=auto (an Arabic message reads right to left)", () => {
    const html = renderThread(open());
    expect(bubbleIds(html)).toEqual(["m1", "m2", "m3"]);
    expect(bubble(html, "m1")).toContain('class="bubble in"'); expect(bubble(html, "m2")).toContain('class="bubble out"');
    expect(bubble(html, "m1")).toContain('dir="auto"'); expect(bubble(html, "m1")).toContain('<time class="num" dir="ltr">09:00</time>');
  });
  it("a tick is a WORD, only on our messages, from the delivery status", () => {
    const c = conv({ messages: ["sending", "sent", "delivered", "read", "failed"].map((s, i) => msg({ id: `o${i}`, direction: "out", deliveryStatus: s })).concat([msg({ id: "in1", deliveryStatus: "read" })]) });
    const html = renderThread(open(c));
    expect(bubble(html, "o0")).toContain(">Sending…<"); expect(bubble(html, "o1")).toContain(">Sent<"); expect(bubble(html, "o2")).toContain(">Delivered<");
    expect(bubble(html, "o3")).toContain(">Read<"); expect(bubble(html, "o4")).toContain(">Failed<");
    expect(bubble(html, "in1")).not.toContain('class="tick"');
  });
  it("a held message says it is held on the PC and has NO button at all", () => {
    const html = renderThread(open(conv({ messages: [msg({ id: "h1", direction: "out", held: true, deliveryStatus: "held", text: "Hello" })] })));
    const b = bubble(html, "h1");
    expect(b).toContain("Held on your PC: open the PC to release or discard it"); expect(b).toContain('class="held-badge"');
    expect(b).not.toMatch(/<button|data-act|<a |<form/i); expect(b).not.toMatch(/release<|discard<|again/i);
  });
  it("a photo or voice note is a placeholder: no url, no image element", () => {
    const html = renderThread(open(conv({ messages: [msg({ id: "i1", type: "image", text: "look https://cdn.example/x.jpg" }), msg({ id: "a1", type: "audio", text: "" })] })));
    expect(bubble(html, "i1")).toContain("Photo: open on your PC"); expect(bubble(html, "a1")).toContain("Voice: open on your PC");
    expect(html).not.toMatch(/https?:|<img|<audio|<video|src=|href=/);
  });
  it("a cut message ends with the long-message sentence, a whole one does not", () => {
    const html = renderThread(open(conv({ messages: [msg({ id: "t1", truncated: true, text: "abc" }), msg({ id: "t2", truncated: false, text: "def" })] })));
    expect(bubble(html, "t1")).toContain("Long message: open it on your PC"); expect(bubble(html, "t2")).not.toContain("Long message");
  });
  it("escapes the text", () => expect(renderThread(open(conv({ messages: [msg({ text: "<b onclick=1>x</b>" })] })))).not.toContain("<b onclick"));
});

describe("header and contact", () => {
  it("name and number (number left-to-right), or Customer and nothing when the role may not see contact", () => {
    expect(renderThread(open())).toContain('<bdi>Amina B.</bdi>'); expect(renderThread(open())).toContain('class="num phone" dir="ltr">0550123456<');
    const a = renderThread(open(anon(conv())));
    expect(a).toContain("<bdi>Customer</bdi>"); expect(a).not.toContain('class="num phone"'); expect(a).not.toMatch(/undefined|null/);
  });
  it("has a Back button and no title element with customer text", () => {
    const html = renderThread(open()); expect(html).toContain('data-act="back"'); expect(html).not.toContain("<title");
  });
});

describe("states", () => {
  it("loading = skeleton bubbles; unknown conversation = error; no messages = empty", () => {
    expect(renderThread(mk({ read: "loading", data: null, asOf: null, openId: "c1" }))).toContain("<i></i>");
    expect(renderThread(mk({ openId: "zzz" }))).toContain("Could not show this conversation.");
    expect(renderThread(open(conv({ messages: [] })))).toContain("No messages yet");
  });
  it("older messages are on the PC once the window is full (10), not before", () => {
    const ten = conv({ messages: Array.from({ length: 10 }, (_, i) => msg({ id: `k${i}` })) });
    expect(renderThread(open(ten))).toContain("Older messages are on your PC");
    expect(renderThread(open(conv()))).not.toContain("Older messages are on your PC");
  });
  it("shows what the user has SEEN: a newer message waits behind a Reload", () => {
    const c = conv(); const later = conv({ messages: [...c.messages, msg({ id: "m4", text: "Salut ?" })] });
    const html = renderThread(mk({ data: proj([later]), openId: "c1", seen: c }));
    expect(bubbleIds(html)).toEqual(["m1", "m2", "m3"]); expect(html).toContain("A new message arrived"); expect(html).toContain('data-act="reload-thread"');
    expect(renderThread(open(c))).not.toContain("A new message arrived");
  });
  it("offline: the composer is still there and says the reply is saved for later", () => {
    const html = renderThread(open(conv(), { online: false }));
    expect(html).not.toMatch(/<textarea[^>]*disabled/); expect(html).toContain("No connection: your reply is saved on this phone and sent later.");
  });
  it("a copy older than 24 h can be read, not answered", () => {
    const html = renderThread(open(conv(), { asOf: 0 }));
    expect(html).toMatch(/<textarea[^>]*disabled/); expect(html).toContain("This copy is too old to reply from.");
  });
});

describe("composer", () => {
  it("keeps the draft and is a form for a reply", () => {
    const html = renderThread(open(conv(), { draft: "Bonjour <3" }));
    expect(html).toContain('data-form="composer" data-mode="reply" data-id="c1"'); expect(html).toContain("Bonjour &lt;3</textarea>"); expect(html).toContain('dir="auto"');
  });
  it("one open reply per conversation: textarea and button are disabled while one is open, and the chip says why", () => {
    const html = renderThread(open(conv(), { commands: [reply({ state: "sent" })] }));
    expect(html).toMatch(/<textarea[^>]*disabled/); expect(html).toMatch(/<button type="submit"[^>]*disabled/); expect(html).toContain("Sent. Your PC has not confirmed yet.");
    const other = renderThread(open(conv(), { commands: [reply({ state: "sent", target: { type: "conversation", id: "c2", lastSeenMessageId: "x" } })] }));
    expect(other).not.toMatch(/<textarea[^>]*disabled/);
  });
  it("notes on the conversation reuse the notes module with the conversation's version", () => {
    const html = renderThread(open());
    expect(html).toContain('data-entity="conversation"'); expect(html).toContain('data-version="4"'); expect(html).toContain('data-mode="note"');
  });
});
