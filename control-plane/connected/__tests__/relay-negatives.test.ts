// Hostile reviewer, check a: what the relay refuses on the routes the phone calls (real worker, real SQL).
import { describe, expect, it } from "vitest";
import { INSTALLATION_ID, SHOP_ID, WORKSPACE_ID } from "./harness";
import { OTHER_INST, OTHER_WS, expectRefusal, setup } from "./relay-neg-world";

const statusUrl = (id: string, deviceId: string) => `/v1/commands/${id}?workspaceId=${WORKSPACE_ID}&deviceId=${deviceId}`;
const projUrl = (deviceId: string) =>
  `/v1/projections?workspaceId=${WORKSPACE_ID}&deviceId=${deviceId}&shopId=${SHOP_ID}&type=dashboard`;
const rows = (w: Awaited<ReturnType<typeof setup>>["w"]) => w.count("SELECT COUNT(*) AS n FROM connected_command");

describe("relay negatives (phone routes)", () => {
  it("no token: post, status, projection and the desktop pairing route are 401", async () => {
    const { w, a, forbidden } = await setup();
    const env = await w.commandEnvelope(a);
    await expectRefusal(await w.call("/v1/commands", { method: "POST", body: env }), 401, forbidden);
    await expectRefusal(await w.call(statusUrl("env_00000001", a.deviceId)), 401, forbidden);
    await expectRefusal(await w.call(projUrl(a.deviceId)), 401, forbidden);
    const pairBody = { workspaceId: WORKSPACE_ID, memberId: "member_owner", deviceId: "device_new_0001" };
    await expectRefusal(await w.call("/v1/desktop/pairings", { method: "POST", body: pairBody }), 401, forbidden);
    await expectRefusal(await w.call("/v1/desktop/pairings", { method: "POST", token: a.token, body: pairBody }), 401, forbidden);
    expect(rows(w)).toBe(0);
  });

  it("another device's token: no post, status or projection of someone else's", async () => {
    const { w, a, b, x, forbidden } = await setup();
    const queued = await w.submit(b, await w.commandEnvelope(b));
    expect(queued.status).toBe(202);
    const bId = ((await queued.json()) as { commandId: string }).commandId;
    await expectRefusal(await w.call(statusUrl(bId, b.deviceId), { token: a.token }), 401, forbidden);
    await expectRefusal(await w.call(statusUrl(bId, a.deviceId), { token: a.token }), 404, [...forbidden, bId]);
    await expectRefusal(await w.call(statusUrl(bId, a.deviceId), { token: x.token }), 401, forbidden);
    await expectRefusal(await w.call(projUrl(b.deviceId), { token: a.token }), 401, forbidden);
    await expectRefusal(await w.submit(a, await w.commandEnvelope(b)), 401, forbidden);
    await expectRefusal(await w.submit(x, await w.commandEnvelope(a)), 401, forbidden);
    await expectRefusal(await w.submit(a, await w.commandEnvelope(a, { memberId: b.memberId })), 401, forbidden);
    expect(rows(w)).toBe(1);
  });

  it("a revoked device is 401 on post, replay, status and projection", async () => {
    const { w, a, forbidden } = await setup();
    const env = await w.commandEnvelope(a);
    expect((await w.submit(a, env)).status).toBe(202);
    expect((await w.revoke(a.deviceId)).status).toBeLessThan(300);
    const stored = [...forbidden, env.envelopeId];
    await expectRefusal(await w.submit(a, env), 401, stored);
    await expectRefusal(await w.submit(a, await w.commandEnvelope(a)), 401, stored);
    await expectRefusal(await w.call(statusUrl(env.envelopeId, a.deviceId), { token: a.token }), 401, stored);
    await expectRefusal(await w.call(projUrl(a.deviceId), { token: a.token }), 401, stored);
  });

  it("an envelope that is not the device's workspace, installation, shop or recipient is refused and nothing is queued", async () => {
    const { w, a, b, forbidden } = await setup();
    const cases: Array<[string, Record<string, string>, number]> = [
      ["workspace", { workspaceId: OTHER_WS }, 401],
      ["installation", { installationId: OTHER_INST, recipientId: OTHER_INST }, 403],
      ["recipient", { recipientId: OTHER_INST }, 400],
      ["sender", { senderId: b.deviceId }, 400],
      ["shop", { shopId: "shop_other_01" }, 403],
      ["result type", { messageType: "command.result" }, 400],
    ];
    for (const [name, fields, status] of cases) {
      const env = await w.commandEnvelope(a, fields);
      await expectRefusal(await w.submit(a, env), status, forbidden);
      expect(rows(w), name).toBe(0);
    }
    expect((await w.submit(a, await w.commandEnvelope(a, { installationId: INSTALLATION_ID }))).status).toBe(202);
  });

  it("the desktop cannot store a projection for a device under ANOTHER member's name (kills the member check of the projection route)", async () => {
    const { w, a, b } = await setup();
    const proj = () => w.count("SELECT COUNT(*) AS n FROM connected_projection");
    const before = proj();
    const refused = await w.putProjection(await w.projectionEnvelope(a, { memberId: b.memberId }));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "projection_recipient_rejected" });
    expect(proj()).toBe(before);
    expect((await w.putProjection(await w.projectionEnvelope(a))).status).toBeLessThan(300);
    expect(proj()).toBe(before + 1);
  });

  it("two phones of the SAME member: one cannot ask for the other's command (status is scoped to the device, not only to the member)", async () => {
    const { w, a, forbidden } = await setup();
    const a2 = await w.pair("device_alice_02", "member_owner");
    w.allowCommands(a2);
    const queued = await w.submit(a2, await w.commandEnvelope(a2));
    expect(queued.status).toBe(202);
    const id = ((await queued.json()) as { commandId: string }).commandId;
    expect((await w.call(statusUrl(id, a2.deviceId), { token: a2.token })).status).toBe(200);
    await expectRefusal(await w.call(statusUrl(id, a.deviceId), { token: a.token }), 404, [...forbidden, id]);
  });

  it("a replayed command id gets the same answer and one row; the same key with another body is 409", async () => {
    const { w, a } = await setup();
    const env = await w.commandEnvelope(a);
    const first = (await (await w.submit(a, env)).json()) as { commandId: string; relaySequence: number };
    const again = await w.submit(a, env);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ commandId: first.commandId, relaySequence: first.relaySequence });
    const changed = await w.commandEnvelope(a, { idempotencyKey: env.idempotencyKey });
    expect((await w.submit(a, changed)).status).toBe(409);
    expect(rows(w)).toBe(1);
  });
});
