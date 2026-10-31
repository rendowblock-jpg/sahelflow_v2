/**
 * @vitest-environment happy-dom
 */
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  send: vi.fn(async (_input: unknown) => "sent" as const),
  listen: vi.fn(async (_cb: unknown) => () => undefined),
  router: { push: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => bridge.router }));
vi.mock("@/hooks/use-whatsapp-socket", () => ({ useWhatsAppSocket: () => undefined }));
vi.mock("@/lib/notifications/native-client", () => ({
  sendDesktopNotification: bridge.send,
  listenForDesktopNotificationActions: bridge.listen,
}));

import { markEverythingRead, useNotificationCenter, type NotificationCenterItem } from "../use-notification-center";

function item(id: string, extra: Partial<NotificationCenterItem> = {}): NotificationCenterItem {
  return {
    id, durable: true, type: "info", category: "inbox", severity: "info", title: "t", body: "b",
    time: "now", read: false, archived: false, link: "/inbox", createdAt: "2026-10-31T10:00:00.000Z",
    nativePending: true, kind: "whatsapp.received", ...extra,
  };
}

interface Call { url: string; body: Record<string, unknown> | null }
let calls: Call[] = [];

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function fakeFetch(items: NotificationCenterItem[], claim: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, body });
    if (url.endsWith("/sync")) return json({ projected: items.length });
    if (url.includes("/native")) return json(body?.action === "claim" ? claim : { state: "ok" });
    return json({ notifications: items, unreadCount: items.length, preference: null });
  }));
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children);

beforeEach(() => {
  bridge.send.mockClear();
  // The seller is looking at another window: foreground suppression must not hide the toast.
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false });
});
afterEach(() => vi.unstubAllGlobals());

describe("the notification hook, rendered", () => {
  it("40 arrivals give ONE toast; the other 39 are closed as 'burst'", async () => {
    const items = Array.from({ length: 40 }, (_, i) => item(`n${i + 1}`));
    fakeFetch(items, { deliver: true, link: "/inbox", soundEnabled: false, preview: null });
    const { result } = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(40));
    await waitFor(() => {
      const closed = calls.filter((c) => c.url.includes("/native") && c.body?.action === "complete");
      expect(closed).toHaveLength(40);
    });
    expect(bridge.send).toHaveBeenCalledTimes(1);
    const closed = calls.filter((c) => c.url.includes("/native") && c.body?.action === "complete");
    expect(closed.filter((c) => c.body?.reasonCode === "burst")).toHaveLength(39);
    expect(closed.filter((c) => c.body?.state === "sent")).toHaveLength(1);
  });

  it("quiet hours hold the toast but not the list", async () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`q${i + 1}`, { kind: "delivery.failed" }));
    fakeFetch(items, { deliver: false, reasonCode: "quiet-hours" });
    const { result } = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(5));
    await waitFor(() => expect(calls.filter((c) => c.body?.action === "claim")).toHaveLength(5));
    expect(bridge.send).not.toHaveBeenCalled();
    expect(result.current.unreadCount).toBe(5);
  });
});

describe("read-all (A2)", () => {
  it("also dismisses the computed items, so no badge is left", async () => {
    fakeFetch([], {});
    const ok = await markEverythingRead([item("d1", { nativePending: false }), item("c1", { durable: false, nativePending: false, kind: null })]);
    expect(ok).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/api/notifications/read-all"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/api/notifications/dismissals"))).toBe(true);
  });
});
