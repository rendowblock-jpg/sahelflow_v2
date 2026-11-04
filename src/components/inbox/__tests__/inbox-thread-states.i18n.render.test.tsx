/**
 * @vitest-environment happy-dom
 */
/**
 * Founder (4 Nov 2026, thread lane step 5): every state of the thread pane must
 * be rendered ONCE per language and read as a sentence: loading skeleton, empty,
 * failed-to-load WITH a retry button, offline (sending paused), and a message
 * that is sending / failed / held. No raw dictionary key, no English left over
 * in fr/ar, a role a screen reader announces, a button the seller can press.
 *
 * Rendered with the real InboxV3Thread and the real dictionaries (the same
 * lookup order as useI18n: static dictionary, then the runtime catalogs).
 */
import { fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InboxV3Thread } from "@/components/inbox/inbox-v3-thread";
import { getTranslations, renderTranslation, type Locale } from "@/lib/i18n";
import { getInboxWorkspaceCopy, type InboxWorkspaceKey } from "@/lib/i18n/inbox-workspace";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { makeInboxWorkspace, makeMessage } from "@/test-utils/inbox-fixture";
import { render } from "@/test-utils/render";

const state = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));

function tFor(locale: Locale) {
  return (key: string, params?: Record<string, string | number>): string => {
    const value = getTranslations(locale)[key] ?? getRuntimeTranslation(locale, key) ?? key;
    return params ? renderTranslation(value, params, locale) : value;
  };
}

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => realT(state.locale)(key, params),
    locale: state.locale,
    dir: state.locale === "ar" ? "rtl" : "ltr",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

const realT = (locale: Locale) => tFor(locale);

const LOCALES = ["en", "fr", "ar"] as const;
const RAW_KEY = /\b(inbox|whatsapp)\.[a-zA-Z]+\.[a-zA-Z.]+/;

function thread(locale: Locale, overrides: Record<string, unknown> = {}, props: { viewerIsOwner?: boolean } = {}) {
  state.locale = locale;
  const t = tFor(locale);
  const copy = (key: InboxWorkspaceKey, params?: Record<string, string | number>) => getInboxWorkspaceCopy(locale, key, params);
  const workspace = makeInboxWorkspace({ locale, t, copy, ...overrides });
  return {
    workspace,
    ...render(
      <InboxV3Thread
        workspace={workspace}
        selectedCandidate={null}
        onBackToQueue={() => {}}
        onSelectCandidate={() => {}}
        {...props}
      />,
    ),
  };
}

afterEach(() => {
  state.locale = "en";
  vi.restoreAllMocks();
});

describe("thread states in en / fr / ar", () => {
  for (const locale of LOCALES) {
    const t = tFor(locale);

    it(`loading: a status region with a spoken label (${locale})`, () => {
      const { container } = thread(locale, { messages: [], loadingMessages: true });
      const region = container.querySelector('[data-thread-state="loading"]');
      expect(region?.getAttribute("role")).toBe("status");
      expect(region?.textContent).toBe(t("inbox.thread.state.loading"));
      expect(region?.textContent).not.toMatch(RAW_KEY);
      if (locale !== "en") expect(region?.textContent).not.toBe(tFor("en")("inbox.thread.state.loading"));
    });

    it(`empty: says there are no messages, in the language (${locale})`, () => {
      const { container } = thread(locale, { messages: [] });
      const empty = container.querySelector('[data-thread-state="empty"]');
      expect(empty?.textContent).toContain(t("inbox.thread.state.empty.title"));
      expect(empty?.textContent).toContain(t("inbox.thread.state.empty.lead"));
      expect(empty?.textContent).not.toMatch(RAW_KEY);
      if (locale !== "en") expect(empty?.textContent).not.toContain(tFor("en")("inbox.thread.state.empty.title"));
    });

    it(`failed to load: an alert with ONE retry button that reloads (${locale})`, () => {
      const retryLoadMessages = vi.fn();
      const { container } = thread(locale, { messages: [], messagesLoadFailed: true, retryLoadMessages });
      // A failed load must NOT pose as an empty conversation.
      expect(container.querySelector('[data-thread-state="empty"]')).toBeNull();
      const failed = container.querySelector('[data-thread-state="error"]');
      expect(failed?.getAttribute("role")).toBe("alert");
      expect(failed?.textContent).toContain(t("inbox.thread.state.error.title"));
      expect(failed?.textContent).not.toMatch(RAW_KEY);
      const retry = failed?.querySelector("button");
      expect(retry?.textContent?.trim()).toBe(t("inbox.thread.state.error.retry"));
      expect(failed?.querySelectorAll("button")).toHaveLength(1);
      fireEvent.click(retry as HTMLElement);
      expect(retryLoadMessages).toHaveBeenCalledTimes(1);
    });

    it(`offline: sending is paused, said in words, the composer does not look ready (${locale})`, () => {
      const { container } = thread(locale, {
        transport: { reachable: false, status: "disconnected", user: null, wsOpen: false },
      });
      const hint = container.querySelector("[data-thread-paused-hint]");
      expect(hint?.textContent).toBe(t("inbox.thread.pausedHint"));
      expect(hint?.textContent).not.toMatch(RAW_KEY);
      expect(container.querySelector('[data-send-available="false"]')).not.toBeNull();
      const send = container.querySelector("[data-inbox-send]") as HTMLButtonElement | null;
      expect(send?.disabled).toBe(true);
      expect(send?.getAttribute("aria-label") ?? send?.textContent ?? "").not.toMatch(RAW_KEY);
    });

    it(`browser offline: the same paused hint (${locale})`, () => {
      vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
      const { container } = thread(locale, {});
      expect(container.querySelector("[data-thread-paused-hint]")?.textContent).toBe(t("inbox.thread.pausedHint"));
    });

    it(`message sending: the clock has a spoken name (${locale})`, () => {
      const { container } = thread(locale, {
        messages: [makeMessage({ id: "m-send", direction: "outbound", body: "ok", deliveryStatus: "sending", outboxState: "queued" })],
      });
      const named = Array.from(container.querySelectorAll("[aria-label]")).map((el) => el.getAttribute("aria-label"));
      expect(named).toContain(t("inbox.messageStatus.sending"));
      expect(named.join("|")).not.toMatch(RAW_KEY);
      expect(container.querySelector("[data-failed-send]")).toBeNull();
    });

    it(`message failed: Not sent, the reason in words, one retry that retries (${locale})`, () => {
      const failedMessage = makeMessage({
        id: "m-fail",
        direction: "outbound",
        body: "hello",
        deliveryStatus: "failed",
        outboxState: "dead_letter",
        outboxEffectKey: "effect-1",
        outboxErrorCode: "whatsapp_not_connected",
      });
      const retryFailedMessage = vi.fn();
      const { container } = thread(locale, { messages: [failedMessage], retryFailedMessage });
      const block = container.querySelector("[data-failed-send]");
      expect(block?.textContent).toContain(t("inbox.thread.failed.label"));
      expect(block?.textContent).not.toMatch(RAW_KEY);
      const retry = block?.querySelector("button");
      expect(retry?.textContent?.trim()).toBe(t("inbox.retry"));
      fireEvent.click(retry as HTMLElement);
      expect(retryFailedMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "m-fail" }));
    });

    it(`message held: the owner reads why and can send or discard; others are told to ask (${locale})`, () => {
      const held = makeMessage({
        id: "m-held",
        direction: "outbound",
        body: "held text",
        deliveryStatus: "sending",
        outboxState: "held",
        outboxEffectKey: "effect-held",
      });
      const approveHeldMessage = vi.fn();
      const discardHeldMessage = vi.fn();
      const owner = thread(locale, { messages: [held], approveHeldMessage, discardHeldMessage }, { viewerIsOwner: true });
      const notice = owner.container.querySelector('[role="status"][class*="border-dashed"]');
      expect(notice?.textContent).toContain(t("whatsapp.heldSend.label"));
      expect(notice?.textContent).not.toMatch(RAW_KEY);
      const names = Array.from(notice?.querySelectorAll("button") ?? []).map((b) => b.textContent?.trim());
      expect(names).toContain(t("whatsapp.heldSend.approve"));
      expect(names).toContain(t("whatsapp.heldSend.discard"));
      fireEvent.click(Array.from(notice?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === t("whatsapp.heldSend.approve")) as HTMLElement);
      expect(approveHeldMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "m-held" }));
      owner.unmount();

      const staff = thread(locale, { messages: [held], approveHeldMessage, discardHeldMessage }, { viewerIsOwner: false });
      const staffNotice = staff.container.querySelector('[role="status"][class*="border-dashed"]');
      expect(staffNotice?.textContent).toContain(t("whatsapp.heldSend.askOwner"));
      expect(staffNotice?.querySelector("button")).toBeNull();
    });
  }

  it("fr and ar sentences differ from English for every state key (nothing was left in English)", () => {
    const keys = [
      "inbox.thread.state.loading",
      "inbox.thread.state.empty.title",
      "inbox.thread.state.empty.lead",
      "inbox.thread.state.error.title",
      "inbox.thread.state.error.lead",
      "inbox.thread.state.error.retry",
      "inbox.thread.pausedHint",
      "inbox.thread.failed.label",
      "inbox.retry",
      "inbox.messageStatus.sending",
      "whatsapp.heldSend.label",
      "whatsapp.heldSend.askOwner",
    ];
    for (const key of keys) {
      for (const locale of ["fr", "ar"] as const) {
        expect(tFor(locale)(key), `${locale} ${key}`).not.toBe(tFor("en")(key));
        expect(tFor(locale)(key), `${locale} ${key}`).not.toBe(key);
      }
    }
  });

  it("the load hook marks a failed FOREGROUND load (and only that) and the workspace hands the thread a retry", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const hook = read("src/hooks/inbox/use-inbox-thread.ts");
    const catchBlock = hook.slice(hook.indexOf("} catch {", hook.indexOf("const loadMessages")), hook.indexOf("} finally {", hook.indexOf("const loadMessages")));
    expect(catchBlock).toMatch(/!background[\s\S]*setMessagesLoadFailed\(true\)/);
    expect(hook).toMatch(/setLoadingMessages\(true\);\s*setMessagesLoadFailed\(false\)/);
    const workspace = read("src/hooks/use-inbox-workspace.ts");
    expect(workspace).toMatch(/messagesLoadFailed: thread\.messagesLoadFailed/);
    expect(workspace).toMatch(/retryLoadMessages:[\s\S]*thread\.loadMessages\(activeChat\)/);
  });
});
