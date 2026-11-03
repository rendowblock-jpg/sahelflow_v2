/**
 * @vitest-environment happy-dom
 */
/**
 * A form that pre-fills the pair from a stored record ("New order" -> pick a saved customer, edit customer, onboarding)
 * passes the commune as it was stored. The stored spelling can differ from the list's in case, apostrophe or accent
 * ("M'Sila" stored, "M'sila" listed): the select must show the listed commune and tell the form the listed name.
 */
import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import communeData from "../../../../data/communes.json";
import { WilayaCommuneSelect } from "../wilaya-commune-select";

let fetched: string[] = [];

beforeEach(() => {
  fetched = [];
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = String(input);
    fetched.push(url);
    const code = Number(new URL(url, "http://x").searchParams.get("wilaya"));
    return { ok: true, status: 200, json: async () => ({ communes: (communeData as Array<{ wilayaCode: number }>).filter((c) => c.wilayaCode === code) }) };
  });
});
afterEach(() => vi.unstubAllGlobals());

/** A parent that holds the pair like the order form does (and records every commune the select reports). */
function Harness({ wilaya, commune, report, follow = true, locale }: { wilaya: string; commune: string; report: (v: string) => void; follow?: boolean; locale?: "en" }) {
  const [w, setW] = useState(wilaya);
  const [c, setC] = useState(commune);
  return (
    <WilayaCommuneSelect
      wilaya={w}
      commune={c}
      onWilayaChange={setW}
      onCommuneChange={(v) => {
        report(v);
        if (follow) setC(v);
      }}
      locale={locale}
    />
  );
}

const communeTrigger = (): HTMLElement => {
  const [, commune] = screen.getAllByRole("combobox");
  if (!commune) throw new Error("no commune select");
  return commune;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe("WilayaCommuneSelect pre-filled with a stored commune", () => {
  it("M'Sila (stored) shows the listed M'sila and reports it once", async () => {
    const report = vi.fn();
    render(<Harness wilaya="M'Sila" commune="M'Sila" report={report} locale="en" />);
    await waitFor(() => expect(communeTrigger().textContent).toContain("M'sila"));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("M'sila");
  });

  it("Koléa (stored) shows Kolea and reports it once", async () => {
    const report = vi.fn();
    render(<Harness wilaya="Tipaza" commune="Koléa" report={report} locale="en" />);
    await waitFor(() => expect(communeTrigger().textContent).toContain("Kolea"));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("Kolea");
  });

  it("the same through the dashboard branch (no locale prop), which is what the order form uses", async () => {
    const report = vi.fn();
    render(<Harness wilaya="M'Sila" commune={"m\u2019sila"} report={report} />);
    await waitFor(() => expect(communeTrigger().textContent).toContain("M'sila"));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("M'sila");
  });

  it("a commune that already is the listed name is left alone: shown, nothing reported", async () => {
    const report = vi.fn();
    render(<Harness wilaya="M'Sila" commune="M'sila" report={report} locale="en" />);
    await waitFor(() => expect(communeTrigger().textContent).toContain("M'sila"));
    await settle();
    expect(report).not.toHaveBeenCalled();
  });

  it("an unknown commune is left alone: trigger stays on the placeholder, nothing reported", async () => {
    const report = vi.fn();
    render(<Harness wilaya="Tipaza" commune="Nowhereville" report={report} locale="en" />);
    await waitFor(() => expect(fetched.length).toBeGreaterThan(0));
    await settle();
    expect(communeTrigger().textContent).not.toContain("Nowhereville");
    expect(report).not.toHaveBeenCalled();
  });

  it("a parent that ignores the reported name is told once, not in a loop", async () => {
    const report = vi.fn();
    render(<Harness wilaya="M'Sila" commune="M'Sila" report={report} follow={false} locale="en" />);
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    await settle();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("does not report anything while the wilaya is empty", async () => {
    const report = vi.fn();
    render(<Harness wilaya="" commune="M'Sila" report={report} locale="en" />);
    await settle();
    expect(report).not.toHaveBeenCalled();
  });
});
