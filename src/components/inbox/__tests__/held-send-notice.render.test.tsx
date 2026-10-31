/**
 * @vitest-environment happy-dom
 */
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  HeldSendApproveDialog,
  HeldSendDiscardDialog,
  HeldSendNotice,
} from "@/components/inbox/held-send-notice";
import { getHeldSendDiscardRuntimeTranslation } from "@/lib/i18n/held-send-discard-runtime";
import { getHeldSendRuntimeTranslation } from "@/lib/i18n/held-send-runtime";
import { render, userEvent } from "@/test-utils/render";

// ConfirmDialog reads useI18n for its default labels; the real hook needs the app router.
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

type L = "ar" | "fr" | "en";
const tFor = (locale: L) => (key: string, params?: Record<string, string | number>) => {
  let text = getHeldSendRuntimeTranslation(locale, key) ?? getHeldSendDiscardRuntimeTranslation(locale, key) ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
};
const word = (locale: L, key: string) => getHeldSendDiscardRuntimeTranslation(locale, key) as string;
const PHYSICAL_SIDE = /(^|[\s"])(-?)(ml|mr|pl|pr|left|right|text-left|text-right)-/;
const COARSE_44 = /pointer:coarse\)\]:min-h-11/;

describe("HeldSendNotice", () => {
  it("owner: label with an icon, the reason, and a 44 px Send anyway button", async () => {
    const onApprove = vi.fn();
    const { container } = render(<HeldSendNotice canApprove onApprove={onApprove} t={tFor("en")} />);
    expect(screen.getByText("Held to protect your number")).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    const button = screen.getByRole("button", { name: "Send anyway" });
    expect(button.className).toMatch(COARSE_44);
    expect(screen.queryByText("Ask the shop owner to release it")).toBeNull();
    await userEvent.click(button);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("owner without a discard handler (not wired yet): no Discard button", () => {
    render(<HeldSendNotice canApprove onApprove={vi.fn()} t={tFor("en")} />);
    expect(screen.queryByRole("button", { name: /discard/i })).toBeNull();
  });

  it("owner: both buttons, both 44 px on touch, Discard looks destructive and calls onDiscard once", async () => {
    const onApprove = vi.fn();
    const onDiscard = vi.fn();
    render(<HeldSendNotice canApprove onApprove={onApprove} onDiscard={onDiscard} t={tFor("en")} />);
    const send = screen.getByRole("button", { name: "Send anyway" });
    const discard = screen.getByRole("button", { name: "Discard" });
    expect(send.className).toMatch(COARSE_44);
    expect(discard.className).toMatch(COARSE_44);
    // The Button base class mentions destructive for aria-invalid; the red TEXT is what marks Discard.
    expect(discard.className).toMatch(/text-destructive/);
    expect(send.className).not.toMatch(/text-destructive/);
    await userEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("member: label and the sentence, no button, even when a discard handler exists", () => {
    render(<HeldSendNotice canApprove={false} onApprove={vi.fn()} onDiscard={vi.fn()} t={tFor("en")} />);
    expect(screen.getByText("Held to protect your number")).toBeTruthy();
    expect(screen.getByText("Ask the shop owner to release it")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("discarded: one calm line for everyone, no button, no alert, no 'held' label", () => {
    for (const canApprove of [true, false]) {
      const { unmount } = render(
        <HeldSendNotice discarded canApprove={canApprove} onApprove={vi.fn()} onDiscard={vi.fn()} t={tFor("en")} />,
      );
      expect(screen.getByRole("status").textContent).toContain("Discarded. This message was not sent.");
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText("Held to protect your number")).toBeNull();
      unmount();
    }
  });

  it("discarding in progress: both buttons disabled, the line says so, the box is busy", () => {
    const { container } = render(
      <HeldSendNotice canApprove onApprove={vi.fn()} onDiscard={vi.fn()} discard={{ status: "discarding" }} t={tFor("en")} />,
    );
    expect((screen.getByRole("button", { name: "Send anyway" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Discarding…")).toBeTruthy();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("discard failed: an alert with the reason, buttons enabled, a retry reaches onDiscard", async () => {
    const onDiscard = vi.fn();
    render(
      <HeldSendNotice
        canApprove
        onApprove={vi.fn()}
        onDiscard={onDiscard}
        discard={{ status: "failed", reason: "Could not discard this message. Try again." }}
        t={tFor("en")}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Could not discard this message. Try again.");
    const discard = screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement;
    expect(discard.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Send anyway" }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it.each(["ar", "fr"] as const)("%s: every state uses its own words and start/end classes only", (locale) => {
    const states = [
      <HeldSendNotice key="held" canApprove onApprove={vi.fn()} onDiscard={vi.fn()} t={tFor(locale)} />,
      <HeldSendNotice key="member" canApprove={false} onApprove={vi.fn()} onDiscard={vi.fn()} t={tFor(locale)} />,
      <HeldSendNotice key="done" discarded canApprove onApprove={vi.fn()} t={tFor(locale)} />,
      <HeldSendNotice key="busy" canApprove onApprove={vi.fn()} onDiscard={vi.fn()} discard={{ status: "discarding" }} t={tFor(locale)} />,
      <HeldSendNotice key="fail" canApprove onApprove={vi.fn()} onDiscard={vi.fn()} discard={{ status: "failed", reason: word(locale, "whatsapp.heldSend.discardFailed") }} t={tFor(locale)} />,
    ];
    for (const state of states) {
      const { container, unmount } = render(state);
      expect(container.innerHTML).not.toMatch(PHYSICAL_SIDE);
      unmount();
    }
    render(<HeldSendNotice canApprove onApprove={vi.fn()} onDiscard={vi.fn()} t={tFor(locale)} />);
    expect(screen.getByRole("button", { name: word(locale, "whatsapp.heldSend.discard") })).toBeTruthy();
    expect(screen.getByRole("button", { name: getHeldSendRuntimeTranslation(locale, "whatsapp.heldSend.approve") as string })).toBeTruthy();
  });

  it("ar: the discarded line is Arabic, not the English fallback", () => {
    render(<HeldSendNotice discarded canApprove onApprove={vi.fn()} t={tFor("ar")} />);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toBe(word("ar", "whatsapp.heldSend.discarded"));
    expect(text).toMatch(/[\u0600-\u06FF]/);
    expect(text).not.toMatch(/[A-Za-z]/);
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

describe("HeldSendDiscardDialog", () => {
  it("names what is lost, keeps the other chats out of it, and focus starts on Keep on hold", async () => {
    const onResolve = vi.fn();
    render(<HeldSendDiscardDialog open onResolve={onResolve} t={tFor("en")} />);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("This message will not be sent to this chat. The other chats are not affected.")).toBeTruthy();
    const safe = screen.getByRole("button", { name: "Keep on hold" });
    await waitFor(() => expect(document.activeElement).toBe(safe));
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("resolves true only on Discard, and a close without it resolves false", async () => {
    const yes = vi.fn();
    const { unmount } = render(<HeldSendDiscardDialog open onResolve={yes} t={tFor("en")} />);
    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(yes).toHaveBeenCalledWith(true);
    expect(yes).not.toHaveBeenCalledWith(false);
    unmount();

    const no = vi.fn();
    render(<HeldSendDiscardDialog open onResolve={no} t={tFor("en")} />);
    await userEvent.click(await screen.findByRole("button", { name: "Keep on hold" }));
    expect(no).toHaveBeenCalledWith(false);
    expect(no).not.toHaveBeenCalledWith(true);
  });

  it.each(["ar", "fr"] as const)("%s: title, body and buttons come from the catalog", async (locale) => {
    render(<HeldSendDiscardDialog open onResolve={vi.fn()} t={tFor(locale)} />);
    expect(await screen.findByText(word(locale, "whatsapp.heldSend.discardTitle"))).toBeTruthy();
    expect(screen.getByText(word(locale, "whatsapp.heldSend.discardBody"))).toBeTruthy();
    expect(screen.getByRole("button", { name: word(locale, "whatsapp.heldSend.discard") })).toBeTruthy();
    expect(screen.getByRole("button", { name: getHeldSendRuntimeTranslation(locale, "whatsapp.heldSend.dialogCancel") as string })).toBeTruthy();
  });
});
