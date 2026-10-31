// Hostile reviewer, check a: a body over the limit is 413 before it is parsed, even without a token.
import { describe, expect, it } from "vitest";
import worker from "../worker";
import { setup } from "./relay-neg-world";

const COMMAND_LIMIT = 540_672; // 512 KiB ciphertext (protocol.ts) + 16 KiB of fields
const PAIRING_LIMIT = 16_384;

type W = Awaited<ReturnType<typeof setup>>["w"];
const rows = (w: W) => w.count("SELECT COUNT(*) AS n FROM connected_command");
const post = (w: W, path: string, text: string, token?: string) => {
  const headers: Record<string, string> = { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.5" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return worker.fetch(new Request(`https://relay.test${path}`, { method: "POST", headers, body: text }), w.env);
};

describe("relay body size", () => {
  it("command post: 2 MB is 413 with a token, without one, and even when it is not JSON", async () => {
    const { w, a } = await setup();
    const env = await w.commandEnvelope(a);
    const big = JSON.stringify({ ...env, pad: "x".repeat(2_000_000) });
    const withToken = await post(w, "/v1/commands", big, a.token);
    expect(withToken.status).toBe(413);
    expect(await withToken.json()).toEqual({ error: "payload_too_large" });
    expect((await post(w, "/v1/commands", big)).status).toBe(413);
    expect((await post(w, "/v1/commands", "{".repeat(2_000_000))).status).toBe(413);
    expect((await post(w, "/v1/commands", "{not json", a.token)).status).toBe(400);
    expect(rows(w)).toBe(0);
  });

  it("command post: exactly the limit passes, one byte more is 413, the largest real ciphertext fits", async () => {
    const { w, a } = await setup();
    const env = await w.commandEnvelope(a);
    const base = JSON.stringify({ ...env, pad: "" }).length;
    const exact = JSON.stringify({ ...env, pad: "x".repeat(COMMAND_LIMIT - base) });
    expect(exact.length).toBe(COMMAND_LIMIT);
    expect((await post(w, "/v1/commands", exact, a.token)).status).toBe(202);
    const over = JSON.stringify({ ...env, pad: "x".repeat(COMMAND_LIMIT - base + 1) });
    expect(over.length).toBe(COMMAND_LIMIT + 1);
    expect((await post(w, "/v1/commands", over, a.token)).status).toBe(413);
    const biggest = await w.commandEnvelope(a, { ciphertext: "QUJD".repeat(131_072) });
    expect(JSON.stringify(biggest).length).toBeLessThan(COMMAND_LIMIT);
    expect((await w.submit(a, biggest)).status).toBe(202);
  });

  it("pairing exchange: over 16 KiB is 413, the limit itself is read (and refused as a bad request)", async () => {
    const { w } = await setup();
    const body = (pad: number) =>
      JSON.stringify({ pairingId: "pair_probe_0001", pairingToken: "t".repeat(43), pad: "x".repeat(pad) });
    const empty = body(0).length;
    const over = await post(w, "/v1/pairings/exchange", body(PAIRING_LIMIT - empty + 1));
    expect(over.status).toBe(413);
    expect((await post(w, "/v1/pairings/exchange", body(PAIRING_LIMIT - empty))).status).toBe(400);
  });
  it("a declared Content-Length over the limit is 413 before a byte is read", async () => {
    const { w, a } = await setup();
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${a.token}`, "Content-Length": "540673" };
    const lied = await worker.fetch(new Request("https://relay.test/v1/commands", { method: "POST", headers, body: "{}" }), w.env);
    expect(lied.status).toBe(413);
    const pairing = { "CF-Connecting-IP": "198.51.100.6", "Content-Length": "16385" };
    expect((await worker.fetch(new Request("https://relay.test/v1/pairings/exchange", { method: "POST", headers: pairing, body: "{}" }), w.env)).status).toBe(413);
  });
});

// W200 part 1: the seven routes that used to call request.json() without a bound. Limits are literal on purpose.
const OTHER_ROUTES = [
  { name: "bootstrap", method: "POST", path: "/v1/bootstrap", limit: 65_536 },
  { name: "putCommandPolicy", method: "PUT", path: "/v1/desktop/command-policies", limit: 16_384 },
  { name: "createPairing", method: "POST", path: "/v1/desktop/pairings", limit: 16_384 },
  { name: "putProjection", method: "PUT", path: "/v1/desktop/projections", limit: 540_672 },
  { name: "invalidateCommandPolicies", method: "DELETE", path: "/v1/desktop/command-policies", limit: 4_096 },
  { name: "completeCommand", method: "POST", path: "/v1/desktop/commands/cmd_probe_0001/result", limit: 65_536 },
  { name: "revokeDevice", method: "POST", path: "/v1/desktop/devices/device_probe_01/revoke", limit: 4_096 },
] as const;

/** A JSON object of exactly `limit + delta` bytes (ASCII only, so characters are bytes). */
const sized = (limit: number, delta: number): string => {
  const text = JSON.stringify({ pad: "x".repeat(limit - JSON.stringify({ pad: "" }).length + delta) });
  expect(text.length).toBe(limit + delta);
  return text;
};
const send = (w: W, route: (typeof OTHER_ROUTES)[number], body: string, extra: Record<string, string> = {}) =>
  worker.fetch(
    new Request(`https://relay.test${route.path}`, {
      method: route.method,
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.7", ...extra },
      body,
    }),
    w.env,
  );

describe("relay body size, the seven desktop routes", () => {
  for (const route of OTHER_ROUTES) {
    it(`${route.name}: exactly ${route.limit} bytes is read, one more is 413, a declared length over it is 413`, async () => {
      const { w } = await setup();
      const atLimit = await send(w, route, sized(route.limit, 0));
      expect(atLimit.status, `${route.name} at the limit`).not.toBe(413);
      const over = await send(w, route, sized(route.limit, 1));
      expect(over.status).toBe(413);
      expect(await over.json()).toEqual({ error: "payload_too_large" });
      const lied = await send(w, route, "{}", { "Content-Length": String(route.limit + 1) });
      expect(lied.status).toBe(413);
      // A declared length equal to the limit is read, not refused (kills `declared >= maxBytes`).
      expect((await send(w, route, "{}", { "Content-Length": String(route.limit) })).status).not.toBe(413);
      // Not JSON and small: still the old answer, so only the size changed.
      expect((await send(w, route, "{not json")).status).toBe(400);
      expect(rows(w)).toBe(0);
    });
  }

  it("a 3 MB body is 413 on every route even when it is not JSON and carries no token", async () => {
    const { w } = await setup();
    for (const route of OTHER_ROUTES) {
      expect((await send(w, route, "{".repeat(3_000_000))).status, route.name).toBe(413);
    }
  });
});
