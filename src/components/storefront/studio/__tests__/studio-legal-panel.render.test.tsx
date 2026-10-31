/**
 * @vitest-environment happy-dom
 */
/** The Studio's Legal panel in every state of the brief, in ar (RTL), fr and en. Markup only: no picture was looked at. */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { isLegalReviewed } from "@/lib/storefront/studio-legal";
import { render } from "@/test-utils/render";
import { oldDraftWithoutLegal } from "@/lib/storefront/legal-test-fixtures";
import { LegalPanel, LegalPanelView, type LegalFormValues } from "../studio-legal-panel";

const state = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: lookup } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        let text = lookup(state.locale, key) ?? key;
        for (const [name, value] of Object.entries(params ?? {})) text = text.split(`{${name}}`).join(String(value));
        return text;
      },
      locale: state.locale,
      dir: state.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});

afterEach(() => cleanup());

const word = (key: string) => getRuntimeTranslation(state.locale, key) ?? `MISSING ${key}`;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// An invalid field may carry more words in its label; the fallback is the field's place in the form.
const INPUT_INDEX: Record<string, number> = { "storefront.legalPanel.sellerName": 0, "storefront.legalPanel.returnsDays": 2 };
const field = (key: string): HTMLElement =>
  screen.queryByLabelText(new RegExp("^" + escapeRe(word(key)))) ?? (document.querySelectorAll("input")[INPUT_INDEX[key] ?? 0] as HTMLElement);
const values = (patch: Partial<LegalFormValues> = {}): LegalFormValues => ({ sellerName: "Amine Shop", registerNumber: "", returnsDays: "7", returnShipping: "seller", extraReturns: "", extraTerms: "", ...patch });
const empty = values({ sellerName: "", returnsDays: "", returnShipping: "none" });
const noop = () => undefined;
const view = (props: Partial<Parameters<typeof LegalPanelView>[0]> = {}) =>
  render(<LegalPanelView values={values()} read={false} changedAfterRead={false} showErrors={false} contact={{ phone: "", whatsapp: "" }} onChange={noop} onRead={noop} {...props} />);

describe.each(["ar", "fr", "en"] as const)("Legal panel in %s", (locale) => {
  const use = () => { state.locale = locale; };

  it("loading: a polite status, no form", () => {
    use();
    const { container } = view({ status: "loading" });
    expect(screen.getByRole("status").textContent).toBe(word("storefront.legalPanel.status.loading"));
    expect(container.querySelector("input, textarea")).toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });
  it("empty: the template banner, the three previews, not read, nothing filled in, no error yet", () => {
    use();
    const { container } = view({ values: empty });
    expect(screen.getByRole("note").textContent).toBe(word("storefront.legalPanel.templateBanner"));
    for (const kind of ["terms", "returns", "privacy"]) expect(container.querySelector(`[data-legal-preview="${kind}"]`)).not.toBeNull();
    expect(container.querySelector("[data-legal-read-state='notRead']")?.textContent).toBe(word("storefront.legalPanel.status.notRead"));
    expect((field("storefront.legalPanel.returnsDays") as HTMLInputElement).value).toBe("");
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect((screen.getByRole("button", { name: word("storefront.legalPanel.readButton") }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("editing with errors: both fields say what is wrong and the read button waits", () => {
    use();
    view({ values: values({ sellerName: " ", returnsDays: "31" }), showErrors: true });
    const alerts = screen.getAllByRole("alert").map((node) => node.textContent);
    expect(alerts).toEqual([word("storefront.legalPanel.error.sellerName"), word("storefront.legalPanel.error.returnsDays")]);
    expect(field("storefront.legalPanel.returnsDays").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: word("storefront.legalPanel.readButton") }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("days: a negative number or a word is an error, 0 and 30 are not", () => {
    use();
    for (const [days, bad] of [["-1", true], ["abc", true], ["", true], ["0", false], ["30", false]] as const) {
      const { unmount } = view({ values: values({ returnsDays: days }), showErrors: true });
      expect(screen.queryAllByRole("alert").length > 0).toBe(bad);
      unmount();
    }
  });
  it("saving, saved and failed keep the typed text", () => {
    use();
    for (const [status, key, role] of [["saving", "saving", "status"], ["saved", "saved", "status"], ["failed", "failed", "alert"]] as const) {
      const { unmount } = view({ status, values: values({ sellerName: "Typed Name" }) });
      expect(screen.getByRole(role).textContent).toBe(word(`storefront.legalPanel.status.${key}`));
      expect(screen.getByDisplayValue("Typed Name")).toBeInTheDocument();
      unmount();
    }
  });
  it("read: says so and has nothing left to press; changed after reading: says so and can be pressed again", () => {
    use();
    const first = view({ read: true });
    expect(first.container.querySelector("[data-legal-read-state='read']")?.textContent).toBe(word("storefront.legalPanel.status.read"));
    expect((screen.getByRole("button", { name: word("storefront.legalPanel.readButton") }) as HTMLButtonElement).disabled).toBe(true);
    first.unmount();
    const second = view({ changedAfterRead: true });
    expect(second.container.querySelector("[data-legal-read-state='changedAfterRead']")?.textContent).toBe(word("storefront.legalPanel.status.changedAfterRead"));
    expect((screen.getByRole("button", { name: word("storefront.legalPanel.readButton") }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("typing and pressing reach the callbacks", () => {
    use();
    const onChange = vi.fn();
    const onRead = vi.fn();
    view({ onChange, onRead });
    fireEvent.change(field("storefront.legalPanel.sellerName"), { target: { value: "Karim" } });
    expect(onChange).toHaveBeenCalledWith({ sellerName: "Karim" });
    fireEvent.click(screen.getByRole("button", { name: word("storefront.legalPanel.readButton") }));
    expect(onRead).toHaveBeenCalledTimes(1);
  });
  it("seller text is shown as text, and the layout uses no physical left or right", () => {
    use();
    const { container } = view({ values: values({ sellerName: "<b>Bold</b>", extraTerms: "<img src=x onerror=alert(1)>" }) });
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<b>Bold</b>");
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr)-\d|text-left|text-right|\bleft-|\bright-/);
    expect(container.innerHTML).not.toMatch(/\bw-\[\d+px\]|\bfixed\b/);
  });
});

describe("Legal panel wired to a draft", () => {
  const draft = oldDraftWithoutLegal() as unknown as StorefrontStudioDraft;
  it("a valid edit reaches the draft unread, an invalid one stays on screen only, and I read this marks exactly those texts", () => {
    state.locale = "en";
    const commits: StorefrontStudioDraft[] = [];
    const { rerender } = render(<LegalPanel draft={draft} commit={(next) => commits.push(next)} />);
    fireEvent.change(field("storefront.legalPanel.sellerName"), { target: { value: "Amine" } });
    expect(commits).toHaveLength(0);
    fireEvent.change(field("storefront.legalPanel.returnsDays"), { target: { value: "99" } });
    expect(commits).toHaveLength(0);
    expect(screen.getByDisplayValue("99")).toBeInTheDocument();
    expect(screen.getAllByRole("alert").length).toBe(1);
    fireEvent.change(field("storefront.legalPanel.returnsDays"), { target: { value: "7" } });
    expect(commits).toHaveLength(1);
    expect(commits[0]?.legal).toMatchObject({ sellerName: "Amine", returnsDays: 7, reviewedFingerprint: "" });
    expect(isLegalReviewed(commits[0]?.legal)).toBe(false);
    const withLegal = commits[0] as StorefrontStudioDraft;
    rerender(<LegalPanel draft={withLegal} commit={(next) => commits.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: word("storefront.legalPanel.readButton") }));
    expect(commits).toHaveLength(2);
    expect(isLegalReviewed(commits[1]?.legal)).toBe(true);
  });
});
