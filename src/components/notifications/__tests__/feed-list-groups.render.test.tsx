/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@/test-utils/render";
import type { NotificationCenterItem } from "@/hooks/use-notification-center";
import { NotificationFeedList } from "../notification-feed-list";

vi.mock("@/hooks/use-i18n", async () => {
  const { makeEnglishT } = await import("./i18n-mock");
  return { useI18n: () => ({ t: makeEnglishT(), locale: "en", dir: "ltr" }) };
});

const item = (id: string, over: Partial<NotificationCenterItem>): NotificationCenterItem => ({
  id, durable: true, type: "info", category: "inbox", severity: "info",
  title: `title-${id}`, body: `body-${id}`, time: "now", read: false, archived: false,
  link: "/orders?status=pending", createdAt: "2026-10-31T10:00:00.000Z", nativePending: false,
  kind: null, count: null, ...over,
});
const orders = (id: string, minute: string, count: number) =>
  item(id, { kind: "order.new", count, bodyKey: "notifications.events.order.new.body", createdAt: `2026-10-31T10:${minute}:00.000Z` });

describe("the list folds a burst into one line with a total", () => {
  it("three order rows (5 + 4 + 3) become ONE row that says 12; other rows stay", () => {
    const onAction = vi.fn();
    const { container } = render(
      <NotificationFeedList
        busy={false}
        onAction={onAction}
        groups={[{ key: "2026-10-31", label: "Today", items: [orders("a", "20", 5), orders("b", "10", 4), orders("c", "00", 3), item("z", { kind: "backup.failed", body: "Backup text" })] }]}
      />,
    );
    expect(screen.getByText("12 new orders came in.")).toBeTruthy();
    expect(screen.queryByText("body-a")).toBeNull();
    expect(screen.getByText("Backup text")).toBeTruthy();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("an action on the folded row reaches every row inside it", () => {
    const onAction = vi.fn();
    render(
      <NotificationFeedList
        busy={false}
        onAction={onAction}
        groups={[{ key: "2026-10-31", label: "Today", items: [orders("a", "20", 5), orders("b", "10", 4)] }]}
      />,
    );
    const first = screen.getAllByRole("button")[0];
    expect(first).toBeTruthy();
    if (first) fireEvent.click(first);
    expect(onAction.mock.calls.map((call) => call[0])).toEqual(["a", "b"]);
    expect(new Set(onAction.mock.calls.map((call) => call[1])).size).toBe(1);
  });
});
