// The phone does not know the shop id when it pairs (the exchange reply has none). It asks for its dashboard
// WITHOUT shopId; the relay answers from the device's own projection rows (device + member scoped), and only
// when there is exactly one live shop. Two live shops -> 409 shop_required with the ids (the phone picks), none -> 404.
import { describe, expect, it } from "vitest";
import { SHOP_ID, WORKSPACE_ID, createWorld, type Device, type World } from "./harness";

const OTHER_SHOP = "shop_0002";
const url = (device: Device, extra = "") =>
  `/v1/projections?workspaceId=${WORKSPACE_ID}&deviceId=${device.deviceId}&type=dashboard${extra}`;
const get = (w: World, device: Device, extra = "") => w.call(url(device, extra), { token: device.token });

describe("GET /v1/projections without shopId", () => {
  it("serves the device's only live projection, with the same ETag and 304 rules as with shopId", async () => {
    const w = await createWorld();
    const device = await w.pair();
    const envelope = await w.projectionEnvelope(device, { sequence: 3 });
    expect((await w.putProjection(envelope)).status).toBe(202);
    const response = await get(w, device);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(envelope);
    expect(response.headers.get("ETag")).toBe(`W/"${device.deviceId}.dashboard.3"`);
    expect((await get(w, device, "&sinceSequence=3")).status).toBe(304);
    expect((await get(w, device, "&sinceSequence=2")).status).toBe(200);
  });

  it("is 404 before the desktop approved and published anything", async () => {
    const w = await createWorld();
    const device = await w.pair();
    const response = await get(w, device);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "projection_unavailable" });
  });

  it("is 404 when the only projection has expired", async () => {
    const w = await createWorld();
    const device = await w.pair();
    await w.putProjection(await w.projectionEnvelope(device, { sequence: 1 }));
    w.d1.sqlite.exec("UPDATE connected_projection SET expires_at = '2020-01-01T00:00:00.000Z'");
    expect((await get(w, device)).status).toBe(404);
  });

  it("says shop_required with the live shop ids when the device has projections for two shops", async () => {
    const w = await createWorld();
    const device = await w.pair();
    await w.putProjection(await w.projectionEnvelope(device, { sequence: 1 }));
    await w.putProjection(await w.projectionEnvelope(device, { sequence: 1, shopId: OTHER_SHOP }));
    const response = await get(w, device);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "shop_required", shops: [SHOP_ID, OTHER_SHOP].sort() });
    // an explicit shop still works
    const one = await w.call(url(device, `&shopId=${OTHER_SHOP}`), { token: device.token });
    expect(one.status).toBe(200);
  });

  it("ignores an expired second shop when counting", async () => {
    const w = await createWorld();
    const device = await w.pair();
    await w.putProjection(await w.projectionEnvelope(device, { sequence: 1 }));
    await w.putProjection(await w.projectionEnvelope(device, { sequence: 1, shopId: OTHER_SHOP }));
    w.d1.sqlite.prepare("UPDATE connected_projection SET expires_at = '2020-01-01T00:00:00.000Z' WHERE shop_id = ?").run(OTHER_SHOP);
    expect((await get(w, device)).status).toBe(200);
  });

  it("never serves another device's or another member's projection", async () => {
    const w = await createWorld();
    const first = await w.pair();
    const second = await w.pair();
    await w.putProjection(await w.projectionEnvelope(first, { sequence: 1 }));
    expect((await get(w, second)).status).toBe(404);
  });

  it("still refuses a shopId that is present but malformed, and a missing token", async () => {
    const w = await createWorld();
    const device = await w.pair();
    expect((await w.call(url(device, "&shopId="), { token: device.token })).status).toBe(400);
    expect((await w.call(url(device, "&shopId=bad%20id"), { token: device.token })).status).toBe(400);
    expect((await w.call(url(device))).status).toBe(401);
  });
  it("keeps the member scope even if a row for this device carries another member (defence in depth)", async () => {
    const w = await createWorld();
    const device = await w.pair();
    await w.putProjection(await w.projectionEnvelope(device, { sequence: 1 }));
    w.d1.sqlite.prepare("UPDATE connected_projection SET member_id = 'member_other_01' WHERE device_id = ?").run(device.deviceId);
    expect((await get(w, device)).status).toBe(404);
    const explicit = await w.call(url(device, `&shopId=${SHOP_ID}`), { token: device.token });
    expect(explicit.status).toBe(404);
  });
});
