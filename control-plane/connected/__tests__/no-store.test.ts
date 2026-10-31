// W4SEC-14: every answer of the relay carries Cache-Control: no-store (a shared cache or the browser must never keep a pairing,
// a command or a projection answer). Table-driven over several kinds of answer.
import { describe, expect, it } from "vitest";
import { PWA_ORIGIN, WORKSPACE_ID, createWorld, type World } from "./harness";

type Case = [name: string, status: number, run: (w: World) => Promise<Response>];
const CASES: Case[] = [
  ["healthz ok", 200, (w) => w.call("/healthz")],
  ["healthz unavailable", 503, async (w) => { w.d1.sqlite.exec("DROP TABLE connected_rate_limit"); return w.call("/healthz"); }],
  ["400 invalid request", 400, (w) => w.call("/v1/pairings/exchange", { method: "POST", body: {} })],
  ["401 no token", 401, (w) => w.call(`/v1/desktop/commands?workspaceId=${WORKSPACE_ID}&shopId=shop_0001`)],
  ["403 wrong pairing token", 403, async (w) => { const d = await w.pair(); return w.exchange({ pairingId: "pair_probe_0001", pairingToken: "t".repeat(43) }, d.key); }],
  ["404 unknown route", 404, (w) => w.call("/v1/nothing-here")],
  ["201 pairing exchanged", 201, async (w) => { const d = await w.pair(); const c = await w.createPairing("device_ns000001", "member_owner"); return w.exchange({ pairingId: c.body.pairingId ?? "", pairingToken: c.body.pairingToken ?? "" }, d.key); }],
  ["404 projection of a paired phone", 404, async (w) => w.getProjection(await w.pair())],
  ["429 rate limited", 429, async (w) => { const d = await w.pair(); let last = new Response(null); for (let i = 0; i < 12; i += 1) last = await w.exchange({ pairingId: "pair_probe_0002", pairingToken: "t".repeat(43) }, d.key, { "CF-Connecting-IP": "198.51.100.9" }); return last; }],
  ["204 preflight", 204, (w) => w.call("/v1/commands", { method: "OPTIONS", headers: { Origin: PWA_ORIGIN, "Access-Control-Request-Method": "POST" } })],
];

describe("Cache-Control: no-store on every relay answer", () => {
  it.each(CASES)("%s", async (_name, status, run) => {
    const w = await createWorld({ pwaOrigins: PWA_ORIGIN });
    const res = await run(w);
    expect(res.status).toBe(status);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    if (status !== 204) {
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  });
});
