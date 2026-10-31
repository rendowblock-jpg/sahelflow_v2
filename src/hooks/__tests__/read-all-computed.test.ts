/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { markEverythingRead, type NotificationCenterItem } from "../use-notification-center";

const item = (id: string, durable: boolean): NotificationCenterItem => ({
  id, durable, type: durable ? "info" : "alert", category: durable ? "inbox" : "alert", severity: "info",
  title: `t-${id}`, body: `b-${id}`, time: "now", read: false, archived: false, link: "/orders",
  createdAt: "2026-10-31T10:00:00.000Z", nativePending: false,
});

function fakeFetch(readAllStatus = 200) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response("{}", { status: String(url).endsWith("/read-all") ? readAllStatus : 200 });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("Mark all read through the hook module, with a fake fetch", () => {
  it("marks stored rows read AND dismisses the computed ones, so the badge can reach 0", async () => {
    const calls = fakeFetch();
    expect(await markEverythingRead([item("d1", true), item("c1", false), item("c2", false)])).toBe(true);
    expect(calls[0]?.url).toBe("/api/notifications/read-all");
    const dismissal = calls.find((call) => call.url.endsWith("/dismissals"));
    expect(dismissal?.body).toMatchObject({ action: "dismiss" });
    expect((dismissal?.body as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(["c1", "c2"]);
    expect(calls.some((call) => call.url.includes("/d1"))).toBe(false);
  });
  it("does not touch computed items when the server refuses read-all", async () => {
    const calls = fakeFetch(500);
    expect(await markEverythingRead([item("c1", false)])).toBe(false);
    expect(calls.some((call) => call.url.endsWith("/dismissals"))).toBe(false);
  });
  it("sends no dismissal when there is nothing computed", async () => {
    const calls = fakeFetch();
    await markEverythingRead([item("d1", true)]);
    expect(calls.filter((call) => call.url.endsWith("/dismissals"))).toHaveLength(0);
  });
});
