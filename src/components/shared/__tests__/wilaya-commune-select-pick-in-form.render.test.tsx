/**
 * @vitest-environment happy-dom
 */
/**
 * "New order" -> pick a saved customer: the form sets the wilaya AND the commune in one update while the pair is
 * already on screen, and the commune list of that wilaya is still to be fetched. Measured in the packaged Windows app
 * (lab, 3 Nov): the Commune select stayed on "Select..." for every saved customer, spelling right or wrong, and Create
 * answered "Commune is required".
 *
 * Cause (Radix Select 2.3.1, SelectBubbleInput): inside a <form> the select keeps a hidden native <select>. When `value`
 * changes it writes the value into that element and dispatches "change"; with no <option> for it yet (the list is not
 * loaded) the element reads back "" and the change handler calls onValueChange(""), which cleared the commune the form
 * had just been given. Picking the same customer again worked, because by then the list was loaded.
 *
 * The harness therefore sits inside a <form> (the order form is one) and loads the list late; a select outside a form
 * has no hidden element and does not show the problem.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import communeData from "../../../../data/communes.json";
import { WilayaCommuneSelect } from "../wilaya-commune-select";

const LIST_DELAY_MS = 60;

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = String(input);
    const code = Number(new URL(url, "http://x").searchParams.get("wilaya"));
    await new Promise((resolve) => setTimeout(resolve, LIST_DELAY_MS));
    return { ok: true, status: 200, json: async () => ({ communes: (communeData as Array<{ wilayaCode: number }>).filter((c) => c.wilayaCode === code) }) };
  });
});
afterEach(() => vi.unstubAllGlobals());

/** What selectCustomer does: both values in one update, inside a form, like the order form. */
function PickHarness({ customers, report }: { customers: Array<{ wilaya: string; commune: string }>; report: (v: string) => void }) {
  const [w, setW] = useState("");
  const [c, setC] = useState("");
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {customers.map((customer, index) => (
        <button
          key={index}
          type="button"
          onClick={() => {
            setW(customer.wilaya);
            setC(customer.commune);
          }}
        >
          {`pick ${index}`}
        </button>
      ))}
      <WilayaCommuneSelect
        search
        wilaya={w}
        commune={c}
        onWilayaChange={setW}
        onCommuneChange={(v) => {
          report(v);
          setC(v);
        }}
      />
    </form>
  );
}

// With `search` the pair is preceded by a search box, so the commune select is the LAST combobox.
const communeTrigger = (): HTMLElement => {
  const all = screen.getAllByRole("combobox");
  const commune = all[all.length - 1];
  if (!commune) throw new Error("no commune select");
  return commune;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, LIST_DELAY_MS * 3));

describe("WilayaCommuneSelect when a record is picked after the pair is on screen (inside a form, list loads late)", () => {
  it("a commune spelled exactly like the list (Tiaret / Tiaret) is kept and shown", async () => {
    const report = vi.fn();
    render(<PickHarness customers={[{ wilaya: "Tiaret", commune: "Tiaret" }]} report={report} />);
    fireEvent.click(screen.getByText("pick 0"));
    await waitFor(() => expect(communeTrigger().textContent).toContain("Tiaret"));
    await settle();
    expect(communeTrigger().textContent).toContain("Tiaret");
    expect(report).not.toHaveBeenCalledWith("");
  });

  it("a commune spelled differently (M'Sila stored, M'sila listed) ends up as the listed name, never as empty", async () => {
    const report = vi.fn();
    render(<PickHarness customers={[{ wilaya: "M'Sila", commune: "M'Sila" }]} report={report} />);
    fireEvent.click(screen.getByText("pick 0"));
    await waitFor(() => expect(communeTrigger().textContent).toContain("M'sila"));
    await settle();
    expect(communeTrigger().textContent).toContain("M'sila");
    expect(report).not.toHaveBeenCalledWith("");
    expect(report).toHaveBeenLastCalledWith("M'sila");
  });

  it("picking a customer of another wilaya after the first one fills that commune too", async () => {
    const report = vi.fn();
    render(
      <PickHarness
        customers={[
          { wilaya: "Tiaret", commune: "Tiaret" },
          { wilaya: "Tipaza", commune: "Koléa" },
        ]}
        report={report}
      />,
    );
    fireEvent.click(screen.getByText("pick 0"));
    await waitFor(() => expect(communeTrigger().textContent).toContain("Tiaret"));
    fireEvent.click(screen.getByText("pick 1"));
    await waitFor(() => expect(communeTrigger().textContent).toContain("Kolea"));
    await settle();
    expect(communeTrigger().textContent).toContain("Kolea");
    expect(report).not.toHaveBeenCalledWith("");
  });

  it("the seller still changes the wilaya by hand: that clears the commune (the reset in handleWilayaChange is kept)", async () => {
    const report = vi.fn();
    render(<PickHarness customers={[{ wilaya: "Tiaret", commune: "Tiaret" }]} report={report} />);
    fireEvent.click(screen.getByText("pick 0"));
    await waitFor(() => expect(communeTrigger().textContent).toContain("Tiaret"));
    // The seller's choice reaches Radix through its hidden native <select> as well (that is what its own change handler reads).
    const wilayaNative = document.querySelectorAll("select")[0];
    if (!wilayaNative) throw new Error("no hidden wilaya select");
    fireEvent.change(wilayaNative, { target: { value: "Tipaza" } });
    await waitFor(() => expect(report).toHaveBeenCalledWith(""));
    await settle();
    expect(communeTrigger().textContent).not.toContain("Tiaret");
  });
});
