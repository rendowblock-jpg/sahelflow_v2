/**
 * @vitest-environment happy-dom
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { deriveInboxLinkState } from "@/components/inbox/inbox-link-state";
import { ThreadPausedHint } from "@/components/inbox/inbox-thread-link";
import { getInboxListRuntimeTranslation } from "@/lib/i18n/inbox-list-runtime";
import { getInboxThreadStatesRuntimeTranslation } from "@/lib/i18n/inbox-thread-states-runtime";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      getInboxThreadStatesRuntimeTranslation("en", key) ??
      getInboxListRuntimeTranslation("en", key) ??
      key,
    locale: "en",
    dir: "ltr",
  }),
}));

describe("composer hint", () => {
  it("is one short line that never repeats the cause the banner states", () => {
    const link = deriveInboxLinkState({
      status: "disconnected",
      reachable: true,
      wsOpen: false,
      browserOnline: true,
      dataDegraded: false,
    } as never);
    expect(link.blocksSending).toBe(true);
    const { container } = render(<ThreadPausedHint show />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Sending is paused/i);
    for (const key of [
      "inbox.list.link.reason.disconnected",
      "inbox.list.link.reason.error",
      "inbox.list.link.reason.offline",
      "inbox.list.link.reason.notLinked",
    ]) {
      const cause = getInboxListRuntimeTranslation("en", key) ?? "";
      expect(cause.length).toBeGreaterThan(5);
      expect(text).not.toContain(cause);
    }
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(screen.getAllByText(/Sending is paused/i)).toHaveLength(1);
  });
  it("renders nothing when sending is not blocked", () => {
    const { container } = render(<ThreadPausedHint show={false} />);
    expect(container.textContent).toBe("");
  });
});
