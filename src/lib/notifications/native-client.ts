import { isTauriEnv } from "@/lib/env";

const SAFE_DEEP_LINK = /^\/inbox\?conversation=[A-Za-z0-9%._~-]{1,240}$/;
// Fixed screens a toast may open. Anything else is refused, not guessed.
const SAFE_FIXED_LINKS: ReadonlySet<string> = new Set([
  "/inbox",
  "/orders?status=pending",
  "/orders",
  "/deliveries",
  "/settings?section=backup",
  "/settings?section=license",
]);

export interface NativeNotificationContent {
  title: string;
  body: string;
  link: string;
  soundEnabled: boolean;
}

export function isSafeNotificationLink(value: unknown): value is string {
  return typeof value === "string" && (SAFE_DEEP_LINK.test(value) || SAFE_FIXED_LINKS.has(value));
}

export async function sendDesktopNotification(
  content: NativeNotificationContent,
): Promise<"sent" | "denied" | "unavailable"> {
  if (!isTauriEnv()) return "unavailable";
  const plugin = await import("@tauri-apps/plugin-notification");
  let granted = await plugin.isPermissionGranted();
  if (!granted) granted = (await plugin.requestPermission()) === "granted";
  if (!granted) return "denied";
  plugin.sendNotification({
    title: content.title.slice(0, 120),
    body: content.body.slice(0, 240),
    silent: !content.soundEnabled,
    autoCancel: true,
    extra: { link: content.link },
  });
  return "sent";
}

export async function listenForDesktopNotificationActions(
  onLink: (link: string) => void,
): Promise<() => void> {
  if (!isTauriEnv()) return () => undefined;
  try {
    const { onAction } = await import("@tauri-apps/plugin-notification");
    const listener = await onAction((notification) => {
      const link = notification.extra?.link;
      if (isSafeNotificationLink(link)) onLink(link);
    });
    return () => listener.unregister();
  } catch {
    // The desktop build of the plugin has no `register_listener` command (it is a mobile one), so this rejects on
    // every page load. Opening the page from a clicked toast is then not available here; the toast itself and the
    // in-app list still work. Without this catch the rejection surfaced as an unhandled error on every page.
    return () => undefined;
  }
}
