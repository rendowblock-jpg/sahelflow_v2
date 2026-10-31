/**
 * @vitest-environment happy-dom
 */
/** The delivery row title: the name may be cut short with an ellipsis, the "in testing" chip never is. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { ProviderHeading } from "../provider-heading";

const harness = vi.hoisted(() => ({ status: null as null | "live" | "testing" | "planned" }));

vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: resolve } = await import("@/lib/i18n/runtime-translations");
  return { useI18n: () => ({ t: (key: string) => resolve("en", key) ?? key, locale: "en", dir: "ltr" }) };
});

vi.mock("@/lib/integrations/certification", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/certification")>();
  return { ...actual, integrationStatus: (id: never) => harness.status ?? actual.integrationStatus(id) };
});

afterEach(() => {
  cleanup();
  harness.status = null;
});

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const CUTTING = /(^|\s)(truncate|overflow-hidden|text-ellipsis|line-clamp-\d)(\s|$)/;
const LONG_NAME = "ZR Express - livraison nationale a domicile et en point relais, tarifs negocies";

describe("ProviderHeading", () => {
  it("cuts the name, never the chip: the chip is a sibling of the truncating span, not inside it", () => {
    const { container } = render(<ProviderHeading logo={<svg data-testid="logo" />} name={LONG_NAME} integration="zr" />);
    const chip = screen.getByRole("note");
    const name = screen.getByText(LONG_NAME);
    expect(name.className).toMatch(CUTTING);
    expect(name.contains(chip)).toBe(false);
    expect(chip.className).toContain("shrink-0");
    for (let node: HTMLElement | null = chip; node && node !== container; node = node.parentElement) {
      expect(node.className, `ancestor <${node.tagName.toLowerCase()}> of the chip`).not.toMatch(CUTTING);
    }
  });

  it("shows the logo, the name and the chip in that order", () => {
    render(<ProviderHeading logo={<svg data-testid="logo" />} name="Yalidine" integration="yalidine" />);
    const logo = screen.getByTestId("logo");
    const name = screen.getByText("Yalidine");
    const chip = screen.getByRole("note");
    expect(logo.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no chip once the registry says the courier is live", () => {
    harness.status = "live";
    render(<ProviderHeading logo={null} name="Yalidine" integration="yalidine" />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("Yalidine")).toBeTruthy();
  });
});

describe("the delivery panel row", () => {
  const panel = read("src/components/settings/delivery-credentials-panel.tsx");

  it("builds the title with ProviderHeading and no longer cuts text inline", () => {
    expect(panel).toMatch(/<ProviderHeading[\s\S]{0,400}?integration=\{DELIVERY_PROVIDER_TO_INTEGRATION\[provider\.id\]\}/);
    expect(panel).not.toMatch(/truncate/);
    expect(panel).not.toContain("<TestingBadge");
  });

  it("keeps a 44 px touch target on the row's buttons", () => {
    const button = read("src/components/ui/button.tsx");
    expect(button).toMatch(/sm: "[^"]*min-h-\(--sf-touch-target\)[^"]*min-w-\(--sf-touch-target\)/);
    expect(read("src/app/globals.css")).toMatch(/--sf-touch-target:\s*44px/);
    const buttons = panel.match(/<Button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const tag of buttons) expect(tag, tag).not.toMatch(/size="(?!sm")|min-h-0|h-\d|min-h-\[/);
  });
});
