/**
 * @vitest-environment happy-dom
 */
/**
 * F-0030 through the REAL `InboxV3Queue` (the footer test next door mounts the
 * footer alone; this one proves the wiring a seller actually gets):
 *   - the footer renders only when the loaded list has sample rows;
 *   - the inbox makes NO `/api/demo-data` request on mount;
 *   - the confirm dialog states the exact counts of the GET status read at the
 *     click, and nothing is deleted before the confirm;
 *   - sample rows carry the badge and sit below real rows even when newer.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InboxV3Queue } from "@/components/inbox/inbox-v3-queue";
import { getInboxSampleRuntimeTranslation } from "@/lib/i18n/inbox-sample-runtime";
import { makeChat, makeInboxWorkspace } from "@/test-utils/inbox-fixture";
import { render } from "@/test-utils/render";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast }));

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

/** English sample strings from the shipped catalog; every other key echoes. */
const t = (key: string, params?: Record<string, string | number>) => {
  const text = getInboxSampleRuntimeTranslation("en", key) ?? key;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(params?.[name] ?? ""),
  );
};

const STATUS_LOADED = {
  version: "v",
  loaded: true,
  canSeed: false,
  hasBusinessData: true,
  createdAt: null,
  counts: {
    categories: 5,
    products: 16,
    customers: 23,
    orders: 341,
    deliveries: 200,
    returns: 9,
    refunds: 3,
    conversations: 7,
    messages: 52,
    expenses: 12,
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const real = (n: number, at: number) =>
  makeChat({
    id: `2135550000${n}@s.whatsapp.net`,
    conversationId: `7c1f0d2e-0000-4000-8000-00000000000${n}`,
    name: `Real customer ${n}`,
    lastMessageAt: at,
  });
const sample = (n: number, at: number) =>
  makeChat({
    id: `demo-conversation-0${n}@s.whatsapp.net`,
    conversationId: `demo-conversation-0${n}`,
    name: `Commande DZ-DEMO-${n}`,
    lastMessageAt: at,
  });

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  router.refresh.mockReset();
  router.replace.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function mountQueue(chats: ReturnType<typeof makeChat>[]) {
  const refreshChats = vi.fn();
  const workspace = makeInboxWorkspace({
    chats,
    activeChat: null,
    t,
    refreshChats,
  });
  const view = render(
    <InboxV3Queue
      workspace={workspace as never}
      chats={chats}
      activeChatId={null}
      currentMemberId="member_fixture"
      queueFilter="all"
      workflowFilter="all"
      onQueueFilterChange={() => {}}
      onWorkflowFilterChange={() => {}}
    />,
  );
  return { refreshChats, ...view };
}

const demoDataCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/demo-data"));

describe("inbox queue with and without sample data (F-0030)", () => {
  it("a list of real chats only: no footer, no Sample badge, no /api/demo-data request", async () => {
    const { container } = mountQueue([real(1, NOW), real(2, NOW - 60_000)]);
    expect(
      container.querySelectorAll("[data-inbox-conversation]").length,
    ).toBe(2);
    expect(container.querySelector("[data-inbox-sample-footer]")).toBeNull();
    expect(container.querySelector("[data-inbox-sample-badge]")).toBeNull();
    await Promise.resolve();
    expect(demoDataCalls()).toHaveLength(0);
  });

  it("a list with sample rows: footer shown, still no request on mount", async () => {
    const { container } = mountQueue([
      sample(1, NOW), // the NEWEST row of the list is a sample one
      real(1, NOW - 60_000),
      sample(2, NOW - 120_000),
      real(2, NOW - 180_000),
    ]);
    expect(container.querySelector("[data-inbox-sample-footer]")).not.toBeNull();
    expect(
      screen.getByText("Sample data is mixed with your real data."),
    ).toBeInTheDocument();
    // Let every mount effect and microtask run, then count.
    await waitFor(() =>
      expect(container.querySelectorAll("[data-inbox-conversation]").length).toBe(4),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(demoDataCalls()).toHaveLength(0);
  });

  it("sample rows carry the badge and sit below the real rows, whatever their age", () => {
    const { container } = mountQueue([
      sample(1, NOW),
      real(1, NOW - 60_000),
      sample(2, NOW - 120_000),
      real(2, NOW - 180_000),
    ]);
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-inbox-conversation]"),
    );
    expect(rows.map((row) => row.getAttribute("data-inbox-conversation"))).toEqual([
      "21355500001@s.whatsapp.net",
      "21355500002@s.whatsapp.net",
      "demo-conversation-01@s.whatsapp.net",
      "demo-conversation-02@s.whatsapp.net",
    ]);
    const badged = rows.map(
      (row) => row.querySelector("[data-inbox-sample-badge]") !== null,
    );
    expect(badged).toEqual([false, false, true, true]);
  });

  it("only sample rows in the list: the footer says so and does not claim a mix", () => {
    mountQueue([sample(1, NOW), sample(2, NOW - 60_000)]);
    expect(
      screen.getByText("These conversations are sample data."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sample data is mixed with your real data."),
    ).toBeNull();
  });

  it("the click reads GET /api/demo-data once; the dialog shows its exact counts; nothing is deleted until Confirm", async () => {
    fetchMock.mockResolvedValue(json(STATUS_LOADED));
    const { refreshChats } = mountQueue([real(1, NOW), sample(1, NOW - 60_000)]);
    expect(demoDataCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    const dialog = await screen.findByRole("alertdialog");

    const calls = demoDataCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("/api/demo-data");
    expect(calls[0]![1]?.method ?? "GET").toBe("GET");

    const text = dialog.textContent ?? "";
    expect(text).toContain("Conversations: 7");
    expect(text).toContain("Orders: 341");
    expect(text).toContain("Customers: 23");
    expect(text).toContain("Products: 16");
    // The status also holds deliveries (200), messages (52), expenses (12)...:
    // the dialog prints exactly the four numbers it names, no other figure.
    expect(text.match(/\d+/g)).toEqual(["7", "341", "23", "16"]);

    expect(demoDataCalls().some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(refreshChats).not.toHaveBeenCalled();
  });

  it("Confirm sends one DELETE, then the queue refreshes its lists", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({ loaded: false }) : json(STATUS_LOADED),
    );
    const { refreshChats } = mountQueue([real(1, NOW), sample(1, NOW - 60_000)]);
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove sample data" }));
    await waitFor(() => expect(refreshChats).toHaveBeenCalledTimes(1));
    const deletes = demoDataCalls().filter(([, init]) => init?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Sample data removed.");
  });
});
