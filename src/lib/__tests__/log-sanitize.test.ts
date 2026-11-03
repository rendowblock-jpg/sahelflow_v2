import { describe, expect, it } from "vitest";

import { redactLogText, sanitizeForFile } from "@/lib/log-sanitize";

/**
 * F-0033: what may reach the seller's app.log. Table-tested on purpose: every
 * row is a thing support must be able to read (or must never see).
 */

describe("redactLogText", () => {
  const rows: Array<[string, string, string]> = [
    ["windows user folder", "open C:\\Users\\Amine Bensalem\\AppData\\Local\\x.js failed", "open %USERPROFILE%\\AppData\\Local\\x.js failed"],
    ["windows user folder, forward slashes", "C:/Users/bob/app/db.sqlite", "%USERPROFILE%/app/db.sqlite"],
    ["windows user folder, doubled backslashes", "C:\\\\Users\\\\bob\\\\x", "%USERPROFILE%\\\\x"],
    ["windows user folder at the end of the text", "cwd is C:\\Users\\bob", "cwd is %USERPROFILE%"],
    ["macOS user folder", "/Users/alice/Library/Logs/x", "~/Library/Logs/x"],
    ["linux home folder", "/home/bob/.cache/x", "~/.cache/x"],
    ["e-mail address", "notify amine.b+shop@example.com now", "notify <email> now"],
    ["whatsapp user jid", "to 213555123456@s.whatsapp.net failed", "to <jid> failed"],
    ["whatsapp jid with device", "to 213555123456:12@s.whatsapp.net failed", "to <jid> failed"],
    ["whatsapp lid", "lid 1234567890123@lid", "lid <jid>"],
    ["whatsapp group", "group 120363025246125486@g.us", "group <jid>"],
    ["digit run of 7", "order 1234567 failed", "order <digits> failed"],
    ["digit run of 6 stays", "code 123456 ok", "code 123456 ok"],
    ["algerian local phone", "call 0555 12 34 56 back", "call <digits> back"],
    ["algerian international phone", "call +213 555 12 34 56 back", "call <digits> back"],
    ["arabic-indic digit run", "رقم ١٢٣٤٥٦٧٨ فشل", "رقم <digits> فشل"],
    ["bearer token", "Authorization: Bearer abc.def-ghi_jkl0123456 end", "Authorization: Bearer <secret> end"],
    ["hex secret of 32", "key deadbeefdeadbeefdeadbeefdeadbeef end", "key <secret> end"],
    ["base64 secret", "tok Zm9vYmFyMTIzNDU2Nzg5MEFCQ0RFRkdISUo= end", "tok <secret> end"],
    ["jwt", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r", "<secret>.<secret>.<secret>"],
    ["secret in a query string", "GET /x?token=abc123&page=2", "GET /x?token=<secret>&page=2"],
    ["password assignment", "failed password=hunter2 for user", "failed password=<secret> for user"],
    ["source path with hyphens and slashes stays", "at src/lib/whatsapp/media-object-store.ts:12", "at src/lib/whatsapp/media-object-store.ts:12"],
    ["node internal frame stays", "node:internal/process/task_queues:105:5", "node:internal/process/task_queues:105:5"],
    ["long lowercase identifier stays", "handleInboundConversationRefreshWorker", "handleInboundConversationRefreshWorker"],
    ["uuid stays", "id 123e4567-e89b-12d3-a456-426614174000 ok", "id 123e4567-e89b-12d3-a456-426614174000 ok"],
    ["plain words stay", "Internal server error", "Internal server error"],
  ];

  it.each(rows)("%s", (_name, input, expected) => {
    expect(redactLogText(input)).toBe(expected);
  });

  it("leaves nothing of a user name or a phone in any row", () => {
    const joined = rows.map(([, input]) => redactLogText(input)).join("\n");
    for (const leaked of ["Bensalem", "bob", "alice", "amine.b", "555", "1234567", "hunter2", "deadbeef"]) {
      expect(joined).not.toContain(leaked);
    }
  });
});

describe("sanitizeForFile", () => {
  const base = { ts: "2026-11-03T12:00:00.000Z", level: "error", msg: "api.POST /api/x" };

  it("keeps ts, level and msg", () => {
    expect(sanitizeForFile(base)).toEqual(base);
  });

  it("keeps only scalar context values and cuts strings to 160 characters", () => {
    const out = sanitizeForFile({
      ...base,
      context: {
        orderId: "ord_1",
        statusCode: 500,
        retry: false,
        nothing: null,
        long: "word ".repeat(100),
        nested: { a: 1 },
        list: [1, 2],
        fn: () => 1,
        big: BigInt(5),
        missing: undefined,
        nan: Number.NaN,
      },
    });
    expect(Object.keys(out.context ?? {}).sort()).toEqual(["long", "nothing", "orderId", "retry", "statusCode"]);
    expect(out.context?.long).toHaveLength(160);
    expect(out.context?.statusCode).toBe(500);
  });

  it("drops forbidden context keys whatever their case or spelling", () => {
    const forbidden = [
      "body", "headers", "authorization", "cookie", "pin", "key", "token", "password",
      "Authorization", "Cookie", "PIN", "accessToken", "access_token", "apiKey", "api-key",
      "set-cookie", "sessionCookie", "secret", "clientSecret", "passwordHash", "licenseKey",
    ];
    const context: Record<string, unknown> = { orderId: "ord_1", shipping: "express", idempotencyKey: "idem-1" };
    for (const key of forbidden) context[key] = "value-that-must-not-appear";
    const out = sanitizeForFile({ ...base, context });
    expect(Object.keys(out.context ?? {}).sort()).toEqual(["idempotencyKey", "orderId", "shipping"]);
    expect(JSON.stringify(out)).not.toContain("value-that-must-not-appear");
  });

  it("limits the number of context keys and the length of a key", () => {
    const context: Record<string, unknown> = {};
    for (let i = 0; i < 100; i += 1) context[`k${i}`] = i;
    context["z".repeat(200)] = 1;
    const out = sanitizeForFile({ ...base, context });
    expect(Object.keys(out.context ?? {}).length).toBeLessThanOrEqual(20);
    for (const key of Object.keys(out.context ?? {})) expect(key.length).toBeLessThanOrEqual(40);
  });

  it("redacts context strings and msg", () => {
    const out = sanitizeForFile({
      ...base,
      msg: "api.GET /api/orders for 213555123456@s.whatsapp.net",
      context: { who: "amine@example.com", where: "C:\\Users\\bob\\x" },
    });
    expect(out.msg).toBe("api.GET /api/orders for <jid>");
    expect(out.context).toEqual({ who: "<email>", where: "%USERPROFILE%\\x" });
  });

  it("redacts a secret before cutting, so no prefix of it survives the cut", () => {
    const secret = "Zm9vYmFyMTIzNDU2Nzg5MEFCQ0RFRkdISUpLTE1OTw==";
    const out = sanitizeForFile({ ...base, context: { note: `${"a ".repeat(75)}${secret}` } });
    expect(out.context?.note).not.toContain(secret.slice(0, 10));
  });

  it("keeps error name, a string or numeric code, and the message cut at 200", () => {
    const out = sanitizeForFile({
      ...base,
      error: { name: "PrismaClientKnownRequestError", code: "P2002", message: "word ".repeat(100), stack: "" },
    });
    expect(out.error?.name).toBe("PrismaClientKnownRequestError");
    expect(out.error?.code).toBe("P2002");
    expect(out.error?.message).toHaveLength(200);
    expect(sanitizeForFile({ ...base, error: { name: "E", code: 42, message: "m" } }).error?.code).toBe(42);
    expect(sanitizeForFile({ ...base, error: { name: "E", code: { a: 1 }, message: "m" } }).error).not.toHaveProperty("code");
  });

  it("collapses a multi-line message to one line", () => {
    const out = sanitizeForFile({ ...base, error: { name: "E", message: "\nInvalid `x` invocation:\n\n\n  Unique   constraint" } });
    expect(out.error?.message).toBe("Invalid `x` invocation: Unique constraint");
  });

  it("keeps at most the first 6 stack lines and none of the message header", () => {
    const frames = Array.from({ length: 10 }, (_, i) => `    at fn${i} (C:\\Users\\bob\\app\\server.js:${i + 1}:1)`);
    const stack = ["Error: boom 213555123456@s.whatsapp.net", ...frames].join("\n");
    const out = sanitizeForFile({ ...base, error: { name: "Error", message: "boom", stack } });
    const lines = (out.error?.stack ?? "").split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("at fn0");
    expect(lines[5]).toContain("at fn5");
    expect(out.error?.stack).not.toContain("fn6");
    expect(out.error?.stack).not.toContain("bob");
    expect(out.error?.stack).not.toContain("213555");
    expect(out.error?.stack).toContain("%USERPROFILE%");
  });

  it("redacts the error message and code", () => {
    const out = sanitizeForFile({
      ...base,
      error: { name: "Error", code: "ENOENT 0555123456", message: "no file for amine@example.com at /home/bob/x" },
    });
    expect(out.error?.message).toBe("no file for <email> at ~/x");
    expect(out.error?.code).toBe("ENOENT <digits>");
  });

  it("turns a non-Error value into an error message, and omits error when there is none", () => {
    expect(sanitizeForFile({ ...base, error: "plain 1234567 text" }).error).toEqual({ message: "plain <digits> text" });
    expect(sanitizeForFile(base)).not.toHaveProperty("error");
    expect(sanitizeForFile({ ...base, error: 42 }).error).toEqual({ message: "42" });
  });

  it("never throws on hostile input and always returns a one-line JSON", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const hostile = [
      null, undefined, 7, "text", [], {},
      { msg: { a: 1 }, level: 5, ts: {}, context: circular, error: circular },
      { msg: "x", context: "not an object", error: { message: { a: 1 }, stack: 5, name: 9 } },
      { msg: "x", context: new Proxy({}, { ownKeys() { throw new Error("trap"); } }) },
    ];
    for (const input of hostile) {
      const out = sanitizeForFile(input as never);
      expect(typeof out.msg).toBe("string");
      expect(JSON.stringify(out)).not.toMatch(/[\r\n]/);
    }
  });
});
