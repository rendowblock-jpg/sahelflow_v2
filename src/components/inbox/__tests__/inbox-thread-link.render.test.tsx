/**
 * @vitest-environment happy-dom
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { deriveInboxLinkState } from "@/components/inbox/inbox-link-state";
import { ThreadPausedHint } from "@/components/inbox/inbox-thread-link";
import { getInboxCarnetRuntimeTranslation } from "@/lib/i18n/inbox-carnet-runtime";
import { getInboxThreadCarnetRuntimeTranslation } from "@/lib/i18n/inbox-thread-carnet-runtime";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      getInboxThreadCarnetRuntimeTranslation("en", key) ??
      getInboxCarnetRuntimeTranslation("en", key) ??
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
      "inbox.carnet.link.reason.disconnected",
      "inbox.carnet.link.reason.error",
      "inbox.carnet.link.reason.offline",
      "inbox.carnet.link.reason.notLinked",
    ]) {
      const cause = getInboxCarnetRuntimeTranslation("en", key) ?? "";
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
