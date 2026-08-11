import { expect, test, type Page } from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };

async function waitForHydration(page: Page) {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
}

async function ensureOwnerSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  if (page.url().includes("/login")) {
    const pin = page.locator("#pin");
    await pin.fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
      timeout: 90_000,
    });
  }
}

test.describe.serial("Inbox operational workspace evidence", () => {
  test.beforeEach(async ({ context, page }) => {
    await page.setViewportSize(DESKTOP);
    await context.addCookies([
      {
        name: "sahelflow-locale",
        value: "fr",
        url: "http://localhost:3000",
      },
    ]);
    await ensureOwnerSession(page);
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("saved WhatsApp history stays authoritative when transport is degraded", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const authority = await page.evaluate(async () => {
      const response = await fetch("/api/whatsapp/chats?limit=100", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`inbox projection returned ${response.status}`);
      return (await response.json()) as {
        source: string;
        sidecarReachable: boolean;
        chats: Array<{ jid: string; conversationId: string; unread: number }>;
      };
    });

    expect(authority.source).toBe("database");
    expect(authority.chats.length).toBeGreaterThan(0);
    expect(authority.chats.every((chat) => Boolean(chat.conversationId))).toBe(true);

    const workspace = page.locator('[data-inbox-workspace="v2"]');
    await expect(workspace).toBeVisible();
    const rows = page.locator("[data-inbox-conversation]");
    await expect(rows).toHaveCount(authority.chats.length);
    await expect(page.locator("body")).not.toContainText("(démo)");

    if (!authority.sidecarReachable) {
      await expect(workspace).toContainText("Service WhatsApp indisponible");
      await expect(workspace).toContainText(
        "Les réponses sont disponibles lorsque WhatsApp est connecté",
      );
    }
  });

  test("queue views drive attention without hiding durable conversations", async ({
    page,
  }) => {
    const allRows = page.locator("[data-inbox-conversation]");
    const allCount = await allRows.count();
    expect(allCount).toBeGreaterThan(0);

    await page.locator('[data-inbox-filter="unread"]').click();
    const unreadRows = page.locator('[data-inbox-conversation][data-inbox-unread="true"]');
    const unreadCount = await unreadRows.count();
    expect(unreadCount).toBeGreaterThan(0);
    await expect(page.locator('[data-inbox-conversation][data-inbox-unread="false"]')).toHaveCount(0);

    await page.locator('[data-inbox-filter="all"]').click();
    await expect(allRows).toHaveCount(allCount);
  });

  test("desktop thread, workflow context and mobile drill-in remain coherent", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const firstConversation = page.locator("[data-inbox-conversation]").first();
    await expect(firstConversation).toBeVisible();
    await firstConversation.click();

    const thread = page.locator('[data-inbox-thread="active"]');
    await expect(thread).toBeVisible();
    await expect(thread.getByRole("log")).toBeVisible();
    await expect(page.locator('[data-inbox-context="true"]')).toBeVisible();

    await page.setViewportSize({ width: 640, height: 768 });
    await expect(page.locator('[data-inbox-thread="active"]')).toBeVisible();
    await expect(page.locator('[data-inbox-queue="true"]')).toHaveCount(0);

    // The mobile back control is the first button in the active thread header.
    await thread.locator("header button").first().click();
    await expect(page.locator('[data-inbox-queue="true"]')).toBeVisible();
    await expect(page.locator('[data-inbox-thread="active"]')).toHaveCount(0);
  });
});
