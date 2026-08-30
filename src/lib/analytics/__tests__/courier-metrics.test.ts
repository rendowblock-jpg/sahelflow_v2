import { describe, expect, it } from "vitest";

import {
  buildWilayaCourierMatrix,
  computeCourierMetrics,
  courierCellTone,
  type CourierShipmentRow,
} from "@/lib/analytics/courier-metrics";

function row(overrides: Partial<CourierShipmentRow>): CourierShipmentRow {
  return {
    provider: "yalidine",
    status: "delivered",
    orderStatus: "delivered",
    wilaya: "Alger",
    shippedAt: new Date("2026-01-02T08:00:00Z"),
    orderShippedAt: null,
    deliveredAt: new Date("2026-01-04T08:00:00Z"),
    fee: 600,
    ...overrides,
  };
}

const DAY = 86_400_000;

describe("computeCourierMetrics", () => {
  it("computes delivery/return rates per provider from delivery or order status", () => {
    const metrics = computeCourierMetrics([
      row({ status: "delivered", orderStatus: "delivered" }),
      row({ status: "in_transit", orderStatus: "shipped" }),
      row({ status: "returned", orderStatus: "returned" }),
      row({ status: "pending", orderStatus: "refused" }),
      row({ provider: "maystro", status: "delivered", orderStatus: "delivered" }),
    ]);
    expect(metrics).toHaveLength(2);
    const yalidine = metrics.find((m) => m.provider === "yalidine")!;
    expect(yalidine.shipments).toBe(4);
    expect(yalidine.delivered).toBe(1);
    expect(yalidine.returned).toBe(2);
    expect(yalidine.inTransit).toBe(1);
    expect(yalidine.deliveryRate).toBe(25);
    expect(yalidine.returnRate).toBe(50);
    // Sorted by shipment volume descending.
    expect(metrics[0]!.provider).toBe("yalidine");
  });

  it("computes avg delivery days from order.shippedAt when present", () => {
    const metrics = computeCourierMetrics([
      row({
        orderShippedAt: new Date("2026-01-02T08:00:00Z"),
        shippedAt: new Date("2026-01-01T00:00:00Z"),
        deliveredAt: new Date("2026-01-04T08:00:00Z"),
      }),
    ]);
    expect(metrics[0]!.avgDeliveryDays).toBe(2);
    expect(metrics[0]!.deliveryDaySamples).toBe(1);
  });

  it("falls back to delivery.createdAt when the order has no shippedAt", () => {
    const metrics = computeCourierMetrics([
      row({
        orderShippedAt: null,
        shippedAt: new Date("2026-01-02T00:00:00Z"),
        deliveredAt: new Date("2026-01-03T12:00:00Z"),
      }),
    ]);
    expect(metrics[0]!.avgDeliveryDays).toBe(1.5);
  });

  it("averages over samples with one decimal and ignores broken timestamps", () => {
    const metrics = computeCourierMetrics([
      row({
        orderShippedAt: new Date("2026-01-01T00:00:00Z"),
        deliveredAt: new Date("2026-01-03T00:00:00Z"),
      }),
      row({
        orderShippedAt: new Date("2026-01-01T00:00:00Z"),
        deliveredAt: new Date("2026-01-04T12:00:00Z"),
      }),
      // deliveredAt before shippedAt → excluded sample
      row({
        orderShippedAt: new Date("2026-01-05T00:00:00Z"),
        deliveredAt: new Date("2026-01-01T00:00:00Z"),
      }),
      // delivered but no deliveredAt → excluded sample
      row({ deliveredAt: null }),
    ]);
    expect(metrics[0]!.delivered).toBe(4);
    expect(metrics[0]!.deliveryDaySamples).toBe(2);
    expect(metrics[0]!.avgDeliveryDays).toBe(2.8);
  });

  it("counts courier failures and cancellations separately from returns", () => {
    const metrics = computeCourierMetrics([
      row({ status: "failed", orderStatus: "shipped" }),
      row({ status: "cancelled", orderStatus: "confirmed" }),
    ]);
    expect(metrics[0]!.failed).toBe(2);
    expect(metrics[0]!.returned).toBe(0);
    expect(metrics[0]!.deliveryRate).toBe(0);
  });

  it("sums resolved fees per provider", () => {
    const metrics = computeCourierMetrics([
      row({ fee: 600 }),
      row({ fee: 800 }),
      row({ fee: null }),
    ]);
    expect(metrics[0]!.totalFees).toBe(1400);
  });

  it("omits fees entirely when includeFees is false", () => {
    const metrics = computeCourierMetrics(
      [row({ fee: 600 }), row({ fee: null })],
      { includeFees: false },
    );
    expect(metrics[0]!.totalFees).toBeNull();
  });

  it("returns null fees when no shipment carries fee data", () => {
    const metrics = computeCourierMetrics([row({ fee: null })]);
    expect(metrics[0]!.totalFees).toBeNull();
  });

  it("skips rows without a provider", () => {
    const metrics = computeCourierMetrics([row({ provider: "" })]);
    expect(metrics).toHaveLength(0);
  });

  it("breaks volume ties by provider name for stable order", () => {
    const metrics = computeCourierMetrics([
      row({ provider: "zrexpress" }),
      row({ provider: "maystro" }),
    ]);
    expect(metrics.map((m) => m.provider)).toEqual(["maystro", "zrexpress"]);
  });
});

describe("buildWilayaCourierMatrix", () => {
  function matrixFixture() {
    const rows: CourierShipmentRow[] = [];
    // Alger: 3 yalidine (3 delivered), 1 maystro (0 delivered)
    for (let index = 0; index < 3; index++) {
      rows.push(row({ wilaya: "Alger", provider: "yalidine" }));
    }
    rows.push(
      row({ wilaya: "Alger", provider: "maystro", status: "returned", orderStatus: "returned" }),
    );
    // Oran: 2 maystro (1 delivered, 1 returned)
    rows.push(row({ wilaya: "Oran", provider: "maystro" }));
    rows.push(
      row({ wilaya: "Oran", provider: "maystro", status: "returned", orderStatus: "returned" }),
    );
    // Sétif: 1 zrexpress delivered
    rows.push(row({ wilaya: "Sétif", provider: "zrexpress" }));
    return rows;
  }

  it("builds cells with success rates per wilaya × provider", () => {
    const matrix = buildWilayaCourierMatrix(matrixFixture());
    expect(matrix.wilayas).toEqual(["Alger", "Oran", "Sétif"]);
    expect(matrix.providers).toEqual(["maystro", "yalidine", "zrexpress"]);
    const algerYalidine = matrix.cells.find(
      (cell) => cell.wilaya === "Alger" && cell.provider === "yalidine",
    )!;
    expect(algerYalidine.shipments).toBe(3);
    expect(algerYalidine.delivered).toBe(3);
    expect(algerYalidine.successRate).toBe(100);
    const oranMaystro = matrix.cells.find(
      (cell) => cell.wilaya === "Oran" && cell.provider === "maystro",
    )!;
    expect(oranMaystro.successRate).toBe(50);
  });

  it("limits wilayas to the requested volume-ranked top N", () => {
    const rows: CourierShipmentRow[] = [
      ...matrixFixture(),
      // Blida gets 5 shipments → becomes the top wilaya.
      ...Array.from({ length: 5 }, () =>
        row({ wilaya: "Blida", provider: "maystro" }),
      ),
    ];
    const matrix = buildWilayaCourierMatrix(rows, { wilayaLimit: 2 });
    expect(matrix.wilayas).toEqual(["Blida", "Alger"]);
    expect(matrix.cells.every((cell) => cell.wilaya !== "Oran")).toBe(true);
  });

  it("defaults to the top 10 wilayas", () => {
    const rows = Array.from({ length: 15 }, (_, index) =>
      row({ wilaya: `W${index}` }),
    );
    const matrix = buildWilayaCourierMatrix(rows);
    expect(matrix.wilayas).toHaveLength(10);
  });

  it("returns an empty matrix for empty input", () => {
    const matrix = buildWilayaCourierMatrix([]);
    expect(matrix.wilayas).toEqual([]);
    expect(matrix.providers).toEqual([]);
    expect(matrix.cells).toEqual([]);
  });
});

describe("courierCellTone", () => {
  it("maps COD success-rate bands to presentation tones", () => {
    expect(courierCellTone(100)).toBe("success");
    expect(courierCellTone(80)).toBe("success");
    expect(courierCellTone(79)).toBe("warning");
    expect(courierCellTone(60)).toBe("warning");
    expect(courierCellTone(59)).toBe("danger");
    expect(courierCellTone(0)).toBe("danger");
  });
});

describe("avg delivery days sample window", () => {
  it("uses exact elapsed day fractions", () => {
    const metrics = computeCourierMetrics([
      row({
        orderShippedAt: new Date(Date.parse("2026-01-01T00:00:00Z") - DAY),
        deliveredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ]);
    expect(metrics[0]!.avgDeliveryDays).toBe(1);
  });
});
