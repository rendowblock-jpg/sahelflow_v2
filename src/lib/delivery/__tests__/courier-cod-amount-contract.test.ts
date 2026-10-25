/**
 * S03c-05 — the COD amount sent to the courier is the order total, and the
 * order total already includes the delivery fee.
 *
 * Verified in the code (audit lead S03c-05):
 *   - Order.totalPrice = Σ items + deliveryCost at creation
 *     (manual-order.ts, canonical-source-order.ts) and again on any
 *     price-bearing edit (order-service.ts);
 *   - a canonical order cannot be edited at all, and a legacy order's price
 *     fields are locked once it is confirmed, which is the status a shipment
 *     needs before it can be booked, so the total cannot drift between the
 *     booking and the courier call;
 *   - both booking paths send `totalPrice: order.totalPrice` and never set
 *     the optional `deliveryFee` (Yalidine adds `deliveryFee ?? 0`, so any
 *     caller that set it would make the courier collect the fee twice).
 *
 * This pins that state. It reads source files only, so it needs no database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const legacyCreate = read("src/app/api/delivery/create/route.ts");
const canonicalBooking = read(
  "src/lib/delivery/canonical-courier-booking-authority.ts",
);
const orderService = read("src/lib/data/order-service.ts");
const manualOrder = read("src/lib/orders/manual-order.ts");
const canonicalSourceOrder = read("src/lib/orders/canonical-source-order.ts");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(root, dir))) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const relative = join(dir, entry);
    if (statSync(resolve(root, relative)).isDirectory()) {
      out.push(...sourceFiles(relative));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(relative);
    }
  }
  return out;
}

describe("courier COD amount == order total (S03c-05)", () => {
  it("both booking paths send Order.totalPrice as the amount to collect", () => {
    expect(legacyCreate).toMatch(/totalPrice:\s*order\.totalPrice/);
    expect(canonicalBooking).toMatch(/totalPrice:\s*order\.totalPrice/);
  });

  it("neither booking path adds a separate delivery fee on top of the total", () => {
    expect(legacyCreate).not.toMatch(/deliveryFee/);
    expect(canonicalBooking).not.toMatch(/deliveryFee/);
  });

  it("no caller that builds a shipment request sets the optional deliveryFee", () => {
    const builders = sourceFiles("src").filter((file) => {
      if (file.startsWith(join("src", "lib", "integrations", "delivery"))) return false;
      const text = read(file);
      return /createShipment\(|:\s*ShipmentRequest\b|ShipmentRequest\s*=/.test(text);
    });
    // The two booking paths above plus the courier effect runtime and the AI
    // legacy shipment tool: at least these must be covered by the scan.
    expect(builders).toEqual(
      expect.arrayContaining([
        join("src", "app", "api", "delivery", "create", "route.ts"),
        join("src", "lib", "delivery", "canonical-courier-booking-authority.ts"),
      ]),
    );
    for (const file of builders) {
      expect(read(file), file).not.toMatch(/deliveryFee/);
    }
  });

  it("the order total includes the delivery cost when the order is created and when it is re-priced", () => {
    // The sum (items + delivery cost) lives in orders/order-total.ts; both
    // creators must pass their delivery cost to it.
    expect(manualOrder).toMatch(
      /orderTotalOf\(canonicalItems, data\.deliveryCost\)/,
    );
    expect(canonicalSourceOrder).toMatch(
      /orderTotalOf\(canonicalItems, data\.deliveryCost\)/,
    );
    expect(orderService).toContain("effectiveDeliveryCost");
    expect(orderService).toContain("recomputedTotalPrice");
  });

  it("the amount cannot change between the booking and the courier call", () => {
    // Canonical orders are not editable at all.
    expect(orderService).toContain("CANONICAL_ORDER_EDIT_REQUIRED");
    // Legacy price-bearing edits are locked after confirmation, and a
    // shipment can only be booked for a confirmed order.
    expect(orderService).toContain("ORDER_EDIT_LOCKED_POST_CONFIRMATION");
    expect(legacyCreate).toMatch(/order\.status !== "confirmed"/);
    // The legacy path re-checks that the order did not change while the
    // provider call was in flight.
    expect(legacyCreate).toContain(
      "Order changed while the provider shipment was being created",
    );
  });
});
