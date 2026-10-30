/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { InboxThreadEmpty, InboxThreadError, InboxThreadLoading } from "@/components/inbox/inbox-thread-states";
import { getInboxThreadCarnetRuntimeTranslation } from "@/lib/i18n/inbox-thread-carnet-runtime";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => getInboxThreadCarnetRuntimeTranslation("en", key) ?? key,
    locale: "en",
    dir: "ltr",
  }),
}));

describe("thread states", () => {
  it("loading is a flat skeleton: no shimmer, no pulse, announced politely", () => {
    const { container } = render(<InboxThreadLoading />);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/animate-|shimmer|pulse/);
    const source = readFileSync(resolve(process.cwd(), "src/components/inbox/inbox-thread-states.tsx"), "utf8");
    expect(source).not.toMatch(/animate-|shimmer|pulse|keyframes/);
  });
  it("empty is a blank ruled page with no invented steps", () => {
    const { container } = render(<InboxThreadEmpty />);
    expect(container.querySelector(".carnet-ruled")).not.toBeNull();
    expect(container.querySelector("ol, li")).toBeNull();
  });
  it("error says what failed and offers exactly one retry", () => {
    const onRetry = vi.fn();
    render(<InboxThreadError onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("Messages could not be loaded");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
