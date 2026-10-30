/**
 * @vitest-environment happy-dom
 */
/**
 * G4 charts: a chart carries a text alternative (role="img" label with the
 * headline number) and a "show as table" toggle, so a screen reader and a
 * seller on a weak phone can read the numbers.
 */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChartCard } from "@/components/charts/chart-primitives";
import { render } from "@/test-utils/render";

const TABLE = {
  label: "Net revenue 1 240 000 DZD and expenses 310 000 DZD over 3 months",
  caption: "Revenue and expenses by month",
  columns: ["Month", "Revenue", "Expenses"],
  rows: [
    ["Aug", "320 000 DZD", "80 000 DZD"],
    ["Sep", "410 000 DZD", "95 000 DZD"],
    ["Oct", "510 000 DZD", "135 000 DZD"],
  ],
  showLabel: "Show as table",
  hideLabel: "Show as chart",
} as const;

function mount(withTable: boolean) {
  return render(
    <ChartCard
      title="Revenue vs expenses"
      summary="Net revenue: 1 240 000 DZD"
      config={{}}
      dataTable={withTable ? TABLE : undefined}
    >
      <div data-testid="plot">plot</div>
    </ChartCard>,
  );
}

describe("ChartCard text alternative", () => {
  it("names the plot with the headline number and offers a table toggle", () => {
    mount(true);
    const img = screen.getByRole("img", { name: /1 240 000 DZD/ });
    expect(within(img).getByTestId("plot")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "Show as table" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("swaps the plot for a real table with caption, headers and every row", () => {
    mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const table = screen.getByRole("table", { name: "Revenue and expenses by month" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Month",
      "Revenue",
      "Expenses",
    ]);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("510 000 DZD")).toBeTruthy();
    expect(screen.queryByTestId("plot")).toBeNull();
    const back = screen.getByRole("button", { name: "Show as chart" });
    expect(back.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(back);
    expect(screen.getByTestId("plot")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("leaves a chart without dataTable exactly as before (no button, no img)", () => {
    mount(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("plot")).toBeTruthy();
  });
});
