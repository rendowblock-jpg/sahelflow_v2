/**
 * @vitest-environment happy-dom
 */
/**
 * The confirm button of a destructive ConfirmDialog (found in a real-browser axe run of the bulk-cancel question, P5 slice 1).
 *
 * It used `text-destructive-foreground`, but the theme defines no such token, so the utility does not exist and the
 * button text fell back to the page ink: 2.53 to 1 on the dark-mode red (WCAG needs 4.5 to 1). The tested destructive
 * pair is the Button variant (`bg-destructive text-white`, and `dark:bg-destructive/60` for the dark mode, which
 * contrast-contract.test.ts measures). The dialog must use that variant instead of inventing its own.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { buttonVariants } from "@/components/ui/button";

import { ConfirmDialog } from "../confirm-dialog";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

function confirmButton(destructive: boolean): HTMLElement {
  render(
    <ConfirmDialog
      open
      onOpenChange={() => undefined}
      title="Title"
      description="Body"
      confirmLabel="Do it"
      cancelLabel="Go back"
      destructive={destructive}
      onConfirm={() => undefined}
    />,
  );
  return screen.getByRole("button", { name: "Do it" });
}

describe("ConfirmDialog confirm button", () => {
  it("uses the tested destructive button variant, never a colour token the theme does not define", () => {
    const button = confirmButton(true);
    const classes = button.className.split(/\s+/);
    // the variant's own colour classes survive the merge with the dialog button's base look
    for (const wanted of ["bg-destructive", "text-white", "hover:bg-destructive/90", "dark:bg-destructive/60"]) {
      expect(classes, `missing ${wanted}`).toContain(wanted);
      expect(buttonVariants({ variant: "destructive" }).split(/\s+/), `${wanted} is a destructive variant class`).toContain(wanted);
    }
    expect(classes).toContain("text-white");
    expect(classes).not.toContain("text-destructive-foreground");
    expect(classes).not.toContain("text-primary-foreground");
    expect(classes).not.toContain("bg-primary");
    // pressing it must not turn it primary-coloured (the default look sets active:bg-primary)
    expect(classes).toContain("active:bg-destructive");
    expect(classes).not.toContain("active:bg-primary");
    expect(classes).not.toContain("hover:bg-primary-hover");
  });

  it("keeps the normal primary look when the action is not destructive", () => {
    const classes = confirmButton(false).className.split(/\s+/);
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("text-primary-foreground");
    expect(classes).not.toContain("bg-destructive");
  });
});
