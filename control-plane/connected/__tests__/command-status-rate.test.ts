import { afterEach, describe, expect, it, vi } from "vitest";
import { RATE_RULES } from "../rate-limit";
import { PWA_ORIGIN, WORKSPACE_ID, createWorld, type Device, type World } from "./harness";

const MINUTE = 60_000;
afterEach(() => vi.useRealTimers());

/** Freeze Date inside the NEXT minute (so SQL's real clock is never ahead of it). */
function freeze(secondIntoMinute = 20) {
  const minute = Math.floor(Date.now() / MINUTE) * MINUTE + MINUTE;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(minute + secondIntoMinute * 1000);
}
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
const status = (w: World, d: Device, id: string, token = d.token) =>
  w.call(`/v1/commands/${id}?workspaceId=${WORKSPACE_ID}&deviceId=${d.deviceId}`, { token });

describe("GET /v1/commands/{id} (status) rate limit", () => {
  it("has its own bucket: command_status, 60 a minute", () => {
    expect(RATE_RULES.command_status).toEqual({ limit: 60, windowMs: MINUTE });
    expect(RATE_RULES.command_submit).toEqual({ limit: 30, windowMs: MINUTE });
    expect(RATE_RULES.projection_get).toEqual({ limit: 60, windowMs: MINUTE });
  });

  it("the 61st call in a minute is 429 with Retry-After; other devices and buckets are free", async () => {
    freeze(20);
    const w = await createWorld({ pwaOrigins: PWA_ORIGIN });
    const a = await w.pair();
    const b = await w.pair();
    w.allowCommands(a);
    const envelope = await w.commandEnvelope(a);
    expect((await w.submit(a, envelope)).status).toBe(202);
    const id = (envelope as unknown as { envelopeId: string }).envelopeId;
    for (let i = 0; i < 60; i += 1) expect((await status(w, a, id)).status).toBe(200);
    const limited = await status(w, a, id);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("40");
    expect(await limited.json()).toEqual({ error: "rate_limited", scope: "command_status", retryAfterSeconds: 40 });
    expect((await status(w, b, id)).status).toBe(404);
    expect((await w.submit(a, envelope)).status).toBe(200);
    expect((await w.getProjection(a)).status).toBe(404);
    advance(40_000);
    expect((await status(w, a, id)).status).toBe(200);
  });

  it("a wrong token never spends the device's budget", async () => {
    freeze(20);
    const w = await createWorld({ pwaOrigins: PWA_ORIGIN });
    const a = await w.pair();
    w.allowCommands(a);
    const envelope = await w.commandEnvelope(a);
    await w.submit(a, envelope);
    const id = (envelope as unknown as { envelopeId: string }).envelopeId;
    for (let i = 0; i < 70; i += 1) expect((await status(w, a, id, "z".repeat(48))).status).toBe(401);
    expect((await status(w, a, id)).status).toBe(200);
  });
});
