/**
 * @vitest-environment happy-dom
 */
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HeldSendApproveDialog, HeldSendNotice } from "@/components/inbox/held-send-notice";
import { getHeldSendRuntimeTranslation } from "@/lib/i18n/held-send-runtime";
import { render, userEvent } from "@/test-utils/render";

// ConfirmDialog reads useI18n for its default labels; the real hook needs the app router.
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

type L = "ar" | "fr" | "en";
const tFor = (locale: L) => (key: string, params?: Record<string, string | number>) => {
  let text = getHeldSendRuntimeTranslation(locale, key) ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
};

describe("HeldSendNotice", () => {
  it("owner: label with an icon, the reason, and a 44 px Send anyway button; no Discard", async () => {
    const onApprove = vi.fn();
    const { container } = render(<HeldSendNotice canApprove onApprove={onApprove} t={tFor("en")} />);
    expect(screen.getByText("Held to protect your number")).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    const button = screen.getByRole("button", { name: "Send anyway" });
    expect(button.className).toMatch(/pointer:coarse\)\]:min-h-11/);
    expect(screen.queryByRole("button", { name: /discard/i })).toBeNull();
    expect(screen.queryByText("Ask the shop owner to release it")).toBeNull();
    await userEvent.click(button);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("member: label and the sentence, no button", () => {
    render(<HeldSendNotice canApprove={false} onApprove={vi.fn()} t={tFor("en")} />);
    expect(screen.getByText("Held to protect your number")).toBeTruthy();
    expect(screen.getByText("Ask the shop owner to release it")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses start/end only (RTL safe) and works in ar and fr", () => {
    for (const locale of ["ar", "fr"] as const) {
      const { container, unmount } = render(<HeldSendNotice canApprove onApprove={vi.fn()} t={tFor(locale)} />);
      expect(screen.getByText(getHeldSendRuntimeTranslation(locale, "whatsapp.heldSend.label") as string)).toBeTruthy();
      expect(screen.getByRole("button", { name: getHeldSendRuntimeTranslation(locale, "whatsapp.heldSend.approve") as string })).toBeTruthy();
      expect(container.innerHTML).not.toMatch(/(^|[\s"])(-?)(ml|mr|pl|pr|left|right|text-left|text-right)-/);
      unmount();
    }
  });
});

describe("HeldSendApproveDialog", () => {
  it("says why, puts focus on the safe button, and resolves true only on Send anyway", async () => {
    const onResolve = vi.fn();
    render(<HeldSendApproveDialog open onResolve={onResolve} t={tFor("en")} />);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/The same text just went to 5 other chats/)).toBeTruthy();
    expect(screen.getByText(/spam/)).toBeTruthy();
    const safe = screen.getByRole("button", { name: "Keep on hold" });
    await waitFor(() => expect(document.activeElement).toBe(safe));
    expect(onResolve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send anyway" }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it("Keep on hold resolves false", async () => {
    const onResolve = vi.fn();
    render(<HeldSendApproveDialog open onResolve={onResolve} t={tFor("en")} />);
    await userEvent.click(await screen.findByRole("button", { name: "Keep on hold" }));
    expect(onResolve).toHaveBeenCalledWith(false);
    expect(onResolve).not.toHaveBeenCalledWith(true);
  });
});
