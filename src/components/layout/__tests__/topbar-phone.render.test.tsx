/**
 * @vitest-environment happy-dom
 */
/**
 * Phone top bar. Under 768 px the bar keeps the menu, the name area, search, the
 * bell and the avatar; theme, language and the shop switcher live in the avatar
 * menu (two taps). From 768 px up the bar is the seven-control bar it always was.
 * The phone switch is the existing `useMobile` hook, mocked here.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Topbar } from "@/components/layout/topbar";
import { render } from "@/test-utils/render";

const h = vi.hoisted(() => ({
  phone: false,
  unread: 12,
  locale: "ar",
  resolvedTheme: "light",
  setLocale: vi.fn(),
  setTheme: vi.fn(),
  setActiveShop: vi.fn(async () => undefined),
  loadShops: vi.fn(async () => undefined),
  shops: [
    { id: "a", name: "Shop A", icon: "🏪" },
    { id: "b", name: "Shop B", icon: "🛒" },
  ],
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/orders" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => h.phone }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: h.locale,
    setLocale: h.setLocale,
    isLocalePending: false,
    dir: "rtl",
  }),
}));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: h.resolvedTheme, setTheme: h.setTheme }),
}));
vi.mock("@/stores/shop-store", () => ({
  useShopStore: (select: (state: Record<string, unknown>) => unknown) =>
    select({
      shops: h.shops,
      activeShopId: "a",
      loaded: true,
      switchStatus: "idle",
      switchTargetId: null,
      switchError: null,
      setActiveShop: h.setActiveShop,
      loadShops: h.loadShops,
    }),
}));
vi.mock("@/hooks/use-notification-center", () => ({
  useNotificationCenter: () => ({
    notifications: [],
    unreadCount: h.unread,
    applyLifecycle: vi.fn(),
    readAll: vi.fn(),
  }),
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
  h.unread = 12;
  h.locale = "ar";
  h.resolvedTheme = "light";
  h.setLocale.mockClear();
  h.setTheme.mockClear();
  h.setActiveShop.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <Topbar
      search={<div data-testid="search-slot" />}
      onCommandPaletteOpen={vi.fn()}
      onCheatsheetOpen={vi.fn()}
      serverLocale="ar"
      serverDir="rtl"
    />,
  );
}

const bar = () => document.querySelector("header") as HTMLElement;
const barButtons = () => within(bar()).getAllByRole("button");
const barNames = () => barButtons().map((button) => button.getAttribute("aria-label"));
const badge = () => bar().querySelector('[data-slot="notification-count"]') as HTMLElement | null;

// The avatar is the last button of the bar; fail loudly when the bar has no button at all.
function lastBarButton(): HTMLElement {
  const buttons = barButtons();
  const last = buttons[buttons.length - 1];
  if (!last) throw new Error("the top bar has no button");
  return last;
}

async function openAvatarMenu() {
  const user = userEvent.setup();
  const avatarButton = lastBarButton();
  await user.click(avatarButton);
  const menu = await screen.findByRole("menu");
  return { user, menu };
}

describe("top bar on a phone (under 768 px)", () => {
  beforeEach(() => {
    h.phone = true;
  });

  it("keeps only menu, search, bell and avatar as buttons, with the name as plain text", () => {
    mount();
    expect(barNames()).toEqual([
      "common.openMenu",
      "topbar.searchPlaceholder",
      "common.notifications",
      "topbar.user",
    ]);
    const name = bar().querySelector('[data-slot="topbar-name"]') as HTMLElement;
    expect(name).not.toBeNull();
    expect(name.textContent).toBe("Shop A");
    expect(name.tagName).not.toBe("BUTTON");
    expect(name.className).toContain("truncate");
    expect(name.className).toContain("min-w-0");
  });

  it("never gives two bar buttons the same accessible name (the menu button and the avatar are different things)", () => {
    mount();
    const names = barNames();
    expect(new Set(names).size).toBe(names.length);
  });

  it("does not show the theme, language or shop-switcher buttons in the bar", () => {
    mount();
    expect(within(bar()).queryByRole("button", { name: "theme.switchToDark" })).toBeNull();
    expect(within(bar()).queryByRole("button", { name: "العربية" })).toBeNull();
    expect(within(bar()).queryByRole("button", { name: "Shop A" })).toBeNull();
  });

  it("gives every bar control an accessible name and the 44 px touch floor", () => {
    mount();
    for (const button of barButtons()) {
      expect(button).toHaveAccessibleName();
      expect(button.className).toContain("min-h-(--sf-touch-target)");
      expect(button.className).toContain("min-w-(--sf-touch-target)");
    }
  });

  it("offers the shops, theme and language in the avatar menu", async () => {
    mount();
    const { menu } = await openAvatarMenu();
    for (const name of [
      "Shop A",
      "Shop B",
      "shops.newShop",
      "onboarding.title",
      "theme.light",
      "theme.dark",
      "العربية",
      "Français",
      "English",
    ]) {
      expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
    }
    // The old avatar items are still there.
    expect(within(menu).getByRole("menuitem", { name: "topbar.logout" })).toBeInTheDocument();
  });

  it("marks the current shop, theme and language", async () => {
    mount();
    const { menu } = await openAvatarMenu();
    const marked = (name: string) =>
      within(menu).getByRole("menuitem", { name }).querySelector("svg.lucide-check") !== null;
    expect(marked("Shop A")).toBe(true);
    expect(marked("Shop B")).toBe(false);
    expect(marked("theme.light")).toBe(true);
    expect(marked("theme.dark")).toBe(false);
    expect(marked("العربية")).toBe(true);
    expect(marked("Français")).toBe(false);
  });

  it("switches shop through the same handler as the old switcher", async () => {
    mount();
    const { user, menu } = await openAvatarMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Shop B" }));
    expect(h.setActiveShop).toHaveBeenCalledWith("b");
  });

  it("changes language through the same handler as the old switch", async () => {
    mount();
    const { user, menu } = await openAvatarMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Français" }));
    expect(h.setLocale).toHaveBeenCalledWith("fr");
  });

  it("changes theme through the same handler as the old toggle", async () => {
    mount();
    const { user, menu } = await openAvatarMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "theme.dark" }));
    expect(h.setTheme).toHaveBeenCalledWith("dark");
  });

  it("opens the avatar menu with Enter, closes it with Escape and returns focus to the avatar", async () => {
    mount();
    const user = userEvent.setup();
    const avatar = lastBarButton();
    avatar.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(avatar).toHaveFocus();
  });
});

describe("top bar from 768 px up", () => {
  it("keeps the seven controls in today's order", () => {
    mount();
    expect(barNames()).toEqual([
      "common.openMenu",
      "Shop A",
      "topbar.searchPlaceholder",
      "العربية",
      "theme.switchToDark",
      "common.notifications",
      "topbar.user",
    ]);
  });

  it("hides the three moved controls by CSS below 768 px, so a phone never paints them before hydration", () => {
    mount();
    // The shop and language buttons carry the class; the theme button sits in a wrapper
    // that is display:none until 768 px, then display:contents (so the bar layout is unchanged).
    for (const name of ["Shop A", "العربية"]) {
      expect(within(bar()).getByRole("button", { name }).className).toContain("max-md:hidden");
    }
    const wrapper = within(bar()).getByRole("button", { name: "theme.switchToDark" }).parentElement as HTMLElement;
    expect(wrapper.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:contents"]));
  });

  it("leaves the avatar menu as it is", async () => {
    mount();
    const { menu } = await openAvatarMenu();
    expect(within(menu).queryByRole("menuitem", { name: "Français" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "theme.dark" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Shop B" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "topbar.logout" })).toBeInTheDocument();
  });
});

describe("bell count badge", () => {
  it.each([true, false])("sits inside the button box with logical offsets only (phone=%s)", (phone) => {
    h.phone = phone;
    mount();
    const el = badge() as HTMLElement;
    expect(el).not.toBeNull();
    const tokens = el.className.split(/\s+/);
    // Inside the box: a plain inward offset, never a negative one.
    expect(tokens.some((token) => /^end-\S+$/.test(token))).toBe(true);
    expect(tokens.some((token) => /^top-\S+$/.test(token))).toBe(true);
    expect(tokens.filter((token) => /^-/.test(token))).toEqual([]);
    // Logical properties only, so RTL and LTR mirror.
    expect(tokens.filter((token) => /^(left|right)-/.test(token))).toEqual([]);
  });

  it("shows 9+ above nine and the number up to nine", () => {
    mount();
    expect(badge()?.textContent).toBe("9+");
    cleanup();
    h.unread = 9;
    mount();
    expect(badge()?.textContent).toBe("9");
    cleanup();
    h.unread = 0;
    mount();
    expect(badge()).toBeNull();
  });
});
