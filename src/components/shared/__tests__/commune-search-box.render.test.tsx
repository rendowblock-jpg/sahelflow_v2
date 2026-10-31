/**
 * @vitest-environment happy-dom
 */
/**
 * The type-to-find commune box of the LOCAL order form (STORE-WILAYA69 slice 2): type "Berika", pick the row, and the form
 * gets wilaya "Barika" and commune "Barika" (the parent derives the fee and zone from the wilaya name, as it always did).
 * The two Radix selects stay as the fallback.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { render } from "@/test-utils/render";

// DialogContent reads the language through useI18n, which asks next/navigation for a router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import communeData from "../../../../data/communes.json";
import { resetCommuneIndexForTests } from "../commune-search-box";
import { WilayaCommuneSelect } from "../wilaya-commune-select";

type Break = "ok" | "status" | "throw";
let mode: Break = "ok";
let indexCalls = 0;

beforeEach(() => {
  mode = "ok";
  indexCalls = 0;
  resetCommuneIndexForTests();
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = String(input);
    if (url === "/api/communes") {
      indexCalls += 1;
      if (mode === "throw") throw new TypeError("offline");
      if (mode === "status") return { ok: false, status: 503, json: async () => null };
      return { ok: true, status: 200, json: async () => ({ communes: communeData }) };
    }
    const code = Number(new URL(url, "http://x").searchParams.get("wilaya"));
    return { ok: true, status: 200, json: async () => ({ communes: (communeData as Array<{ wilayaCode: number }>).filter((c) => c.wilayaCode === code) }) };
  });
});
afterEach(() => vi.unstubAllGlobals());

function mount(options: { locale?: "ar" | "fr" | "en"; search?: boolean } = {}) {
  const onWilaya = vi.fn();
  const onCommune = vi.fn();
  const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
  const view = render(
    <form onSubmit={onSubmit}>
      <WilayaCommuneSelect wilaya="" commune="" onWilayaChange={onWilaya} onCommuneChange={onCommune} locale={options.locale ?? "en"} search={options.search ?? true} />
    </form>,
  );
  return { view, onWilaya, onCommune, onSubmit };
}

async function typeIn(text: string) {
  const box = screen.getAllByRole("combobox").find((el) => el.tagName === "INPUT") as HTMLInputElement;
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: text } });
  return box;
}

describe("local order form: commune search", () => {
  it("is off unless the form opts in: the page keeps its two selects and nothing else is a combobox", () => {
    mount({ search: false });
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("type 'Berika', the first row is Barika (wilaya 60) with 'formerly Batna'; clicking it sets wilaya and commune", async () => {
    const { onWilaya, onCommune } = mount();
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    await typeIn("Berika");
    const options = await screen.findAllByRole("option");
    expect(options[0]?.textContent).toContain("Barika");
    expect(options[0]?.textContent).toContain("60");
    expect(options[0]?.textContent).toContain("formerly Batna");
    fireEvent.click(options[0] as HTMLElement);
    expect(onWilaya).toHaveBeenCalledWith("Barika");
    expect(onCommune).toHaveBeenLastCalledWith("Barika");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(indexCalls).toBe(1);
  });

  it("ArrowDown / ArrowUp move, Enter picks and does not submit the form, Escape closes", async () => {
    const { onWilaya, onCommune, onSubmit } = mount();
    const box = await typeIn("Oran");
    const options = await screen.findAllByRole("option");
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(box.hasAttribute("aria-activedescendant")).toBe(false);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[options.length - 1]?.id);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onWilaya).toHaveBeenCalledWith("Oran");
    expect(onCommune).toHaveBeenLastCalledWith("Oran");

    const again = await typeIn("oran");
    await screen.findAllByRole("option");
    fireEvent.keyDown(again, { key: "Escape" });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(again.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(again, { key: "Enter" });
    expect(onCommune).toHaveBeenCalledTimes(1);
  });

  it("says so when nothing matches, and when the list cannot load; the selects stay and the next focus retries", async () => {
    mode = "status";
    mount();
    const box = await typeIn("Batna");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Search is unavailable. Choose the wilaya and commune below."));
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    mode = "ok";
    fireEvent.blur(box);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "qqqqzz" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("No commune found. Choose the wilaya below."));
    expect(indexCalls).toBe(2);
  });

  it("Arabic: the Arabic name is shown, the old wilaya is named in Arabic, the input and rows follow dir=auto", async () => {
    const { onWilaya, onCommune } = mount({ locale: "ar" });
    const box = await typeIn("بريكة");
    expect(box.getAttribute("dir")).toBe("auto");
    const options = await screen.findAllByRole("option");
    expect(options[0]?.textContent).toContain("بريكة");
    // interpolated names carry invisible bidi isolates (U+2066-2069): compare the words
    expect((options[0]?.textContent ?? "").replace(/[\u2066-\u2069]/g, "")).toContain("كانت ضمن باتنة");
    expect(options[0]?.querySelector("span")?.getAttribute("dir")).toBe("auto");
    expect(options[0]?.querySelector("bdi")?.getAttribute("dir")).toBe("ltr");
    fireEvent.click(options[0] as HTMLElement);
    expect(onWilaya).toHaveBeenCalledWith("Barika");
    expect(onCommune).toHaveBeenLastCalledWith("Barika");
  });

  it("an answer that arrives after the next keystroke cannot overwrite it", async () => {
    mount();
    const box = await typeIn("Batna");
    await screen.findAllByRole("option");
    fireEvent.change(box, { target: { value: "Barika" } });
    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
    expect(box.getAttribute("aria-expanded")).toBe("false");
  });

  it("inside a dialog, Escape closes the open list only; the next Escape reaches the dialog", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Order</DialogTitle>
          <DialogDescription>Delivery</DialogDescription>
          <WilayaCommuneSelect wilaya="" commune="" onWilayaChange={vi.fn()} onCommuneChange={vi.fn()} locale="en" search />
        </DialogContent>
      </Dialog>,
    );
    const box = await typeIn("Oran");
    await screen.findAllByRole("option");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
