import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };
const FOUNDER_DESKTOP = { width: 1600, height: 900 };

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
    if (!response.ok) {
      throw new Error(`inbox projection returned ${response.status}`);
    }
    return (await response.json()) as {
      chats: Array<{ unread: number }>;
    };
  });
}

async function selectAllQueue(page: Page) {
  const all = page.getByRole("button", { name: /Toutes|الكل|All/ }).first();
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
      if (!response.ok) {
        throw new Error(`inbox projection returned ${response.status}`);
      }
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
    await expect(workspace).toHaveAttribute("data-inbox-version", "v3");
    await selectAllQueue(page);
    const rows = page.locator("[data-inbox-conversation]");
    await expect(rows).toHaveCount(authority.chats.length);
    await expect(page.locator("body")).not.toContainText("(démo)");

    if (!authority.sidecarReachable) {
      await expect(workspace).toContainText("Service WhatsApp indisponible");
      await rows.first().click();
      const thread = page.locator('[data-inbox-thread="active"]');
      await expect(thread).toContainText(
        "Les réponses sont disponibles lorsque WhatsApp est connecté",
      );
      await expect(thread.locator("textarea")).toBeVisible();
    }
  });

  test("task queues drive attention without hiding durable conversations", async ({
    page,
  }) => {
    await selectAllQueue(page);

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
    const expectedUnread = authority.chats.filter(
      (chat) => chat.unread > 0,
    ).length;
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

    const contextTrigger = page.getByRole("button", {
      name: "Contexte de la conversation",
    });
    await expect(contextTrigger).toBeVisible();
    await contextTrigger.click();
    const contextDialog = page.getByRole("dialog", {
      name: "Contexte de la conversation",
    });
    await expect(contextDialog).toBeVisible();
    await expect(
      contextDialog.locator('[data-inbox-context="true"]'),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(contextDialog).toBeHidden();

    await page.setViewportSize({ width: 640, height: 768 });
    await expect(page.locator('[data-inbox-thread="active"]')).toBeVisible();
    await expect(page.locator('[data-inbox-queue="true"]')).toHaveCount(0);

    const back = thread.locator("header button").first();
    await back.click();
    await expect(page.locator('[data-inbox-queue="true"]')).toBeVisible();
    await expect(page.locator('[data-inbox-thread="active"]')).toHaveCount(0);
  });

  test("Founder 1600 Arabic V3 stays conversation-dominant and offline-compose capable", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(FOUNDER_DESKTOP);
    await context.addCookies([
      {
        name: "sahelflow-locale",
        value: "ar",
        url: baseURL ?? "http://localhost:3000",
      },
    ]);
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const workspace = page.locator('[data-inbox-workspace="v2"]');
    await expect(workspace).toHaveAttribute("data-inbox-version", "v3");
    await selectAllQueue(page);

    const firstConversation = page.locator("[data-inbox-conversation]").first();
    await expect(firstConversation).toBeVisible();
    await firstConversation.click();

    const queue = page.locator('[data-inbox-queue="true"]');
    const thread = page.locator('[data-inbox-thread="active"]');
    await expect(thread).toBeVisible();
    await expect(page.locator('aside [data-inbox-context="true"]')).toHaveCount(0);

    const [queueBox, threadBox] = await Promise.all([
      queue.boundingBox(),
      thread.boundingBox(),
    ]);
    expect(queueBox).not.toBeNull();
    expect(threadBox).not.toBeNull();
    expect(queueBox!.width).toBeGreaterThanOrEqual(310);
    expect(queueBox!.width).toBeLessThanOrEqual(330);
    expect(threadBox!.width).toBeGreaterThan(queueBox!.width * 2);

    const transport = await page.evaluate(async () => {
      const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
      return (await response.json()) as { sidecarReachable?: boolean };
    });
    if (transport.sidecarReachable === false) {
      await expect(thread.locator("textarea")).toBeVisible();
      await expect(
        thread.getByRole("button", { name: /ربط واتساب|Connecter WhatsApp|Connect WhatsApp/ }).first(),
      ).toBeVisible();
    }

    await page.screenshot({
      path: testInfo.outputPath("inbox-v3-founder-ar-1600.png"),
      fullPage: false,
    });
  });
});
