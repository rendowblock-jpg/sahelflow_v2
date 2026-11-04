/**
 * @vitest-environment happy-dom
 */
/**
 * F-0022: the "reconnecting" status sits in the top bar's inline-end cluster, in
 * flow. The bar has a fixed height, so the control cannot push the page, and it
 * is not a floating box, so it cannot cover page actions, the sidebar or the
 * Inbox composer. Real Topbar, real provider, real control; only the monitor's
 * answer is controlled here.
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Topbar } from "@/components/layout/topbar";
import { RuntimeHealthProvider } from "@/components/runtime/runtime-health-provider";
import { render } from "@/test-utils/render";

const h = vi.hoisted(() => ({
  phone: false,
  dir: "rtl" as "rtl" | "ltr",
  health: { status: "ok", failures: 0, retrying: false } as {
    status: "ok" | "reconnecting" | "offline";
    failures: number;
    retrying: boolean;
  },
  retry: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/orders",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/runtime/use-runtime-health", () => ({
  useRuntimeHealth: () => {
    return { state: h.health, retry: h.retry };
  },
}));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => h.phone }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: h.dir === "rtl" ? "ar" : "en",
    setLocale: vi.fn(),
    isLocalePending: false,
    dir: h.dir,
  }),
}));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));
vi.mock("@/stores/shop-store", () => ({
  useShopStore: (select: (state: Record<string, unknown>) => unknown) =>
    select({
      shops: [{ id: "a", name: "Shop A", icon: "🏪" }],
      activeShopId: "a",
      loaded: true,
      switchStatus: "idle",
      switchTargetId: null,
      switchError: null,
      setActiveShop: vi.fn(async () => undefined),
      loadShops: vi.fn(async () => undefined),
    }),
}));
vi.mock("@/hooks/use-notification-center", () => ({
  useNotificationCenter: () => ({ notifications: [], unreadCount: 0, applyLifecycle: vi.fn(), readAll: vi.fn() }),
  dismissNotification: vi.fn(),
  dismissNotifications: vi.fn(),
}));
vi.mock("@/components/notifications/notification-taxonomy", () => ({
  NotificationAnnouncer: () => null,
  getNotificationPresentation: () => ({ icon: () => null, className: "" }),
}));
vi.mock("@/components/updater/update-chip", () => ({ UpdateChip: () => null }));
vi.mock("@/components/layout/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/create-shop-dialog", () => ({ CreateShopDialog: () => null }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth/logout-client", () => ({ logoutAndRedirect: vi.fn() }));
vi.mock("@/lib/i18n/translate-server-error", () => ({ translateServerError: () => "" }));

beforeEach(() => {
  h.phone = false;
  h.dir = "rtl";
  h.health = { status: "ok", failures: 0, retrying: false };
  h.retry.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <RuntimeHealthProvider>
      <Topbar
        search={<div data-testid="search-slot" />}
        onCommandPaletteOpen={vi.fn()}
        onCheatsheetOpen={vi.fn()}
        serverLocale={h.dir === "rtl" ? "ar" : "en"}
        serverDir={h.dir}
      />
    </RuntimeHealthProvider>,
  );
}

const bar = () => document.querySelector("header") as HTMLElement;
const control = () => bar().querySelector('[data-testid="runtime-health-indicator"]') as HTMLElement | null;
const bell = () => within(bar()).getByRole("button", { name: "common.notifications" });
const classesOf = (element: Element) => (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("top bar with the runtime-health control", () => {
  it("shows nothing extra while the runtime answers", () => {
    mount();
    expect(control()).toBeNull();
  });

  it.each(["rtl", "ltr"] as const)(
    "puts the control in the inline-end cluster with the bell, in flow, without touching the bar's height (%s)",
    (dir) => {
      h.dir = dir;
      h.health = { status: "reconnecting", failures: 2, retrying: false };
      mount();
      const status = control();
      expect(status, "the control is rendered inside the <header>").not.toBeNull();
      if (!status) return;

      // Same flex cluster as the bell, placed before it.
      expect(status.parentElement).toBe(bell().parentElement);
      expect(status.compareDocumentPosition(bell()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // No ancestor up to the header (and the control itself) takes it out of flow.
      for (let node: Element | null = status; node && node !== bar(); node = node.parentElement) {
        expect(classesOf(node).filter((token) => /(^|:)(fixed|absolute|sticky)$/.test(token)), node.tagName).toEqual([]);
      }

      // The bar keeps its fixed heights at both breakpoints: nothing can make it grow or wrap.
      const barClasses = classesOf(bar());
      expect(barClasses).toContain("h-14");
      expect(barClasses).toContain("lg:h-12");
      expect(barClasses).toContain("shrink-0");
      expect(classesOf(status.parentElement as Element)).toContain("shrink-0");
      expect(classesOf(status)).toContain("shrink-0");
      expect(classesOf(status)).toContain("whitespace-nowrap");

      expect(status.getAttribute("data-runtime-health")).toBe("reconnecting");
      expect(status.getAttribute("aria-label")).toBe("runtimeHealth.reconnecting.title");
    },
  );

  it("on a phone the control stays in the bar, icon only (the label is hidden below md)", () => {
    h.phone = true;
    h.health = { status: "offline", failures: 3, retrying: false };
    mount();
    const status = control();
    expect(status).not.toBeNull();
    if (!status) return;
    const label = [...status.querySelectorAll("span")].find((span) => span.textContent === "runtimeHealth.offline.title");
    expect(label, "the label span exists for md and up").toBeDefined();
    expect(classesOf(label as Element)).toEqual(expect.arrayContaining(["hidden", "md:inline"]));
    expect(classesOf(status)).toEqual(expect.arrayContaining(["h-8", "w-8", "md:w-auto"]));
    expect(status.getAttribute("aria-label")).toBe("runtimeHealth.offline.title");
    expect(status.getAttribute("data-runtime-health")).toBe("offline");
  });

  it("a click on the bar control opens the note with Retry; Retry reaches the monitor", async () => {
    h.health = { status: "reconnecting", failures: 2, retrying: false };
    mount();
    fireEvent.click(control() as HTMLElement);
    const note = await screen.findByTestId("runtime-health-banner");
    expect(note.getAttribute("data-runtime-health")).toBe("reconnecting");
    fireEvent.click(within(note).getByTestId("runtime-health-retry"));
    expect(h.retry).toHaveBeenCalledTimes(1);
    expect(within(note).getByTestId("runtime-health-dismiss")).toBeTruthy();
  });

  // A mouse click outside is Radix Popover's own non-modal behaviour (ui/popover.tsx adds no override).
  // happy-dom cannot run it: Radix reads a null event target there. The browser probe covers it.
  it("Esc and the Close button each close the note, and the bar control stays", async () => {
    h.health = { status: "reconnecting", failures: 2, retrying: false };
    mount();
    const user = userEvent.setup();
    const trigger = control() as HTMLElement;

    await user.click(trigger);
    expect(await screen.findByTestId("runtime-health-banner")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("runtime-health-banner")).toBeNull());
    expect(control()).toBe(trigger);

    await user.click(trigger);
    await user.click(await screen.findByTestId("runtime-health-dismiss"));
    await waitFor(() => expect(screen.queryByTestId("runtime-health-banner")).toBeNull());
    expect(control()).toBe(trigger);
  });
});
