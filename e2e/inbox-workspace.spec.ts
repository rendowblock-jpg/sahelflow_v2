import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

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

async function fetchUnreadAuthority(page: Page): Promise<{
  chats: Array<{ unread: number }>;
}> {
  return page.evaluate(async () => {
    const response = await fetch("/api/whatsapp/chats?limit=100", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`inbox projection returned ${response.status}`);
    return (await response.json()) as {
      chats: Array<{ unread: number }>;
    };
  });
}

async function selectAllQueue(page: Page) {
  const all = page.getByRole("button", { name: /Toutes/ });
  await expect(all).toBeVisible({ timeout: 30_000 });
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
}

test.describe.serial("Inbox operational workspace evidence", () => {
  let ownerSessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
      storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
    });
    const page = await context.newPage();
    try {
      await context.addCookies([
        {
          name: "sahelflow-locale",
          value: "fr",
          url: baseURL ?? "http://localhost:3000",
        },
      ]);
      await ensureOwnerSession(page);
      ownerSessionCookies = await context.cookies();
      expect(ownerSessionCookies.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ context, page }) => {
    await page.setViewportSize(DESKTOP);
    await context.addCookies(ownerSessionCookies);
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
    await selectAllQueue(page);
    const rows = page.locator("[data-inbox-conversation]");
    await expect(rows).toHaveCount(authority.chats.length);
    await expect(page.locator("body")).not.toContainText("(démo)");

    if (!authority.sidecarReachable) {
      await expect(workspace).toContainText("Service WhatsApp indisponible");
      await rows.first().click();
      await expect(page.locator('[data-inbox-thread="active"]')).toContainText(
        "Les réponses sont disponibles lorsque WhatsApp est connecté",
      );
    }
  });

  test("task queues drive attention without hiding durable conversations", async ({
    page,
  }) => {
    await selectAllQueue(page);

    // Desktop opens useful work immediately. Opening a thread acknowledges it
    // through the explicit PATCH authority, so wait for that convergence before
    // comparing durable unread state with the rendered work queue.
    const activeConversation = page.locator(
      '[data-inbox-conversation][aria-current="true"]',
    );
    await expect(activeConversation).toBeVisible({ timeout: 30_000 });
    await expect(activeConversation).toHaveAttribute(
      "data-inbox-unread",
      "false",
      { timeout: 15_000 },
    );

    const authority = await fetchUnreadAuthority(page);
    expect(authority.chats.length).toBeGreaterThan(0);
    const expectedUnread = authority.chats.filter((chat) => chat.unread > 0).length;
    expect(expectedUnread).toBeGreaterThan(0);

    const allRows = page.locator("[data-inbox-conversation]");
    await expect(allRows).toHaveCount(authority.chats.length);
    await expect(
      page.locator('[data-inbox-conversation][data-inbox-unread="true"]'),
    ).toHaveCount(expectedUnread);

    const unreadQueue = page.getByRole("button", { name: /Non lues/ });
    await unreadQueue.click();
    await expect(unreadQueue).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('[data-inbox-conversation][data-inbox-unread="true"]'),
    ).toHaveCount(expectedUnread);
    await expect(
      page.locator('[data-inbox-conversation][data-inbox-unread="false"]'),
    ).toHaveCount(0);

    await selectAllQueue(page);
    await expect(allRows).toHaveCount(authority.chats.length);
  });

  test("desktop thread, progressive work context and mobile drill-in remain coherent", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await selectAllQueue(page);
    const firstConversation = page.locator("[data-inbox-conversation]").first();
    await expect(firstConversation).toBeVisible();
    await firstConversation.click();

    const thread = page.locator('[data-inbox-thread="active"]');
    await expect(thread).toBeVisible();
    await expect(thread.getByRole("log")).toBeVisible();

    // 1366px keeps the common path two-pane. Advanced Customer / Work / Order
    // context is still one action away instead of consuming permanent width.
    const contextTrigger = page.getByRole("button", {
      name: "Contexte de la conversation",
    });
    await expect(contextTrigger).toBeVisible();
    await contextTrigger.click();
    await expect(page.locator('[data-inbox-context="true"]')).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 640, height: 768 });
    await expect(page.locator('[data-inbox-thread="active"]')).toBeVisible();
    await expect(page.locator('[data-inbox-queue="true"]')).toHaveCount(0);

    const back = thread.locator("header button").first();
    await back.click();
    await expect(page.locator('[data-inbox-queue="true"]')).toBeVisible();
    await expect(page.locator('[data-inbox-thread="active"]')).toHaveCount(0);
  });
});
