import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Source with its comments removed, so an explanation that names a thing is not mistaken for using it. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");

// The packaged app binds its server to a random loopback port at every launch
// (src-tauri/src/runtime_protocol.rs: TcpListener::bind((LOCALHOST, 0))), and
// localStorage belongs to one origin including its port. Anything a seller
// expects to survive a restart therefore cannot live there.
describe("cleared notifications do not depend on browser storage", () => {
  const hook = code("src/hooks/use-notification-center.ts");

  it("the notification hook never touches localStorage or sessionStorage", () => {
    expect(hook).not.toMatch(/localStorage|sessionStorage|sahelflow-dismissed-notifications/);
  });

  it("clearing a computed alert is sent to the server, and restoring it too", () => {
    expect(hook).toContain("`${NOTIFICATIONS_SWR_PREFIX}/dismissals`");
    expect(hook).toContain('action: "dismiss"');
    expect(hook).toContain('action: "restore"');
  });

  it("clear all is one batch, so the computed alerts share one stored entry without racing", () => {
    const topbar = read("src/components/layout/topbar.tsx");
    expect(topbar).toContain("await dismissNotifications(notifications)");
    expect(topbar).not.toMatch(/Promise\.all\(\s*notifications\.map/);
  });

  it("the feed hides what the member cleared before it reaches the browser", () => {
    const route = read("src/app/api/notifications/route.ts");
    expect(route).toContain("readDismissedAlerts(actorContext)");
    expect(route).toContain("filterDismissedAlerts(visibleLegacy, dismissed)");
    // The unread badge is computed from the filtered list.
    const filtered = route.indexOf("filterDismissedAlerts(visibleLegacy, dismissed)");
    const unread = route.indexOf("compatibleLegacy.filter((notification) => !notification.read)");
    expect(filtered).toBeGreaterThan(-1);
    expect(unread).toBeGreaterThan(filtered);
  });

  it("the store is the existing Setting table, keyed per member, with no new table", () => {
    const store = read("src/lib/notifications/operational-dismissals.ts");
    expect(store).toContain('"notification_dismissed:"');
    expect(store).toContain("notificationRecipientId(context)");
    expect(store).toContain("db.setting.");
  });
});
