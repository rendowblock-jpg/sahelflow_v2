/**
 * @vitest-environment happy-dom
 */
/**
 * The one confirm dialog every destructive settings action uses: it names what will be lost and
 * what is NOT affected, puts focus on Cancel, asks for a typed word where data is lost, cannot be
 * submitted twice, and closes on Escape without doing anything.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { DestructiveConfirmDialog } from "../destructive-confirm-dialog";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => (vars?.word ? `${key}|${vars.word}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));

function mount(over: Partial<React.ComponentProps<typeof DestructiveConfirmDialog>> = {}) {
  const onConfirm = vi.fn(async () => {});
  const onOpenChange = vi.fn();
  render(
    <DestructiveConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Reset this shop?"
      lost="All orders, customers and products of this shop."
      notAffected="Your backups and your licence stay."
      confirmLabel="Reset the shop"
      onConfirm={onConfirm}
      {...over}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("DestructiveConfirmDialog", () => {
  it("names what will be lost and what is not affected inside an alertdialog", async () => {
    mount();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Reset this shop?");
    expect(dialog.textContent).toContain("All orders, customers and products of this shop.");
    expect(dialog.textContent).toContain("Your backups and your licence stay.");
    expect(dialog.textContent).toContain("settings.destructive.lostLabel");
    expect(dialog.textContent).toContain("settings.destructive.notAffectedLabel");
  });

  it("puts focus on Cancel, never on the destructive button", async () => {
    mount();
    const cancel = await screen.findByRole("button", { name: "settings.destructive.cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });

  it("keeps the confirm button disabled until the required word is typed", async () => {
    const { onConfirm } = mount({ confirmWord: "RESET" });
    const confirm = await screen.findByRole("button", { name: "Reset the shop" });
    const input = screen.getByRole("textbox");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "RES" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "reset" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows no text field when no word is required", async () => {
    mount();
    await screen.findByRole("alertdialog");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("sends one request when the confirm button is hit twice", async () => {
    let release: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    mount({ onConfirm });
    const confirm = await screen.findByRole("button", { name: "Reset the shop" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      release();
    });
  });

  it("closes on Escape and does not confirm", async () => {
    const { onConfirm, onOpenChange } = mount();
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows a failure inside the dialog and keeps it open", async () => {
    const { onOpenChange } = mount({ error: "Could not reset. Nothing was deleted." });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nothing was deleted.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
