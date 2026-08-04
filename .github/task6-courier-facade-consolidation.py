from pathlib import Path

ROOT = Path.cwd()
DELIVERY = ROOT / "src/lib/delivery"
LEGACY = DELIVERY / "canonical-courier-legacy.ts"
REVIEWED = DELIVERY / "canonical-courier-reviewed-base.ts"
RUNTIME = DELIVERY / "canonical-courier-effect-runtime.ts"
AUTHORITY = DELIVERY / "canonical-courier-booking-authority.ts"
FACADE = DELIVERY / "canonical-courier.ts"


def remove_between(text: str, start: str, end: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"missing start marker: {start}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"missing end marker: {end}")
    return text[:start_index] + text[end_index:]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"expected one match in {label}: {old[:120]}")
    return text.replace(old, new, 1)


def replace_first(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing match in {label}: {old[:120]}")
    return text.replace(old, new, 1)


legacy = LEGACY.read_text(encoding="utf-8")
legacy = remove_between(
    legacy,
    "const bookingSchema = z.object({",
    "const bookingPayloadSchema = z.object({",
)
legacy = remove_between(
    legacy,
    "const reconciliationSchema = z",
    "const trackingEventSchema = z.object({",
)
legacy = remove_between(
    legacy,
    "export async function queueCanonicalCourierBooking(",
    "async function openBookingPayload(",
)
legacy = remove_between(
    legacy,
    "export async function reconcileCanonicalCourierBooking(",
    "export async function getCanonicalCourierPosition(",
)
legacy = replace_once(
    legacy,
    'export const COURIER_BOOKING_EFFECT_TYPE = "courier.shipment.create.v1";',
    '''/**
 * Internal courier effect and tracking runtime.
 *
 * This module is not a seller/API entry point. Booking commands and manual
 * reconciliation are owned by the public canonical-courier facade and booking
 * authority. Only receipt-safe effect draining, position projection and
 * canonical tracking ingestion remain here.
 */
export const COURIER_BOOKING_EFFECT_TYPE = "courier.shipment.create.v1";''',
    "effect runtime header",
)
if "export async function queueCanonicalCourierBooking" in legacy:
    raise SystemExit("obsolete queue export remains in effect runtime")
if "export async function reconcileCanonicalCourierBooking" in legacy:
    raise SystemExit("obsolete reconciliation export remains in effect runtime")
RUNTIME.write_text(legacy, encoding="utf-8")

reviewed = REVIEWED.read_text(encoding="utf-8")
reviewed = replace_first(
    reviewed,
    '  reconcileCanonicalCourierBooking,\n',
    '',
    "reviewed import",
)
reviewed = replace_first(
    reviewed,
    '  reconcileCanonicalCourierBooking,\n',
    '',
    "reviewed re-export",
)
reviewed = replace_once(
    reviewed,
    'from "./canonical-courier-legacy";',
    'from "./canonical-courier-effect-runtime";',
    "reviewed runtime import",
)
reviewed = reviewed.replace(
    'import "server-only";\n',
    '''import "server-only";

/**
 * Canonical courier booking command authority and effect preflight.
 * Public callers must import canonical-courier.ts, never this internal layer.
 */
''',
    1,
)
AUTHORITY.write_text(reviewed, encoding="utf-8")

facade = FACADE.read_text(encoding="utf-8")
facade = replace_once(
    facade,
    'from "./canonical-courier-reviewed-base";',
    'from "./canonical-courier-booking-authority";',
    "canonical facade authority import",
)
FACADE.write_text(facade, encoding="utf-8")

# Update all repository source/test/documentation references to the explicit
# internal roles. This preserves exact code while removing stale authority names.
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix not in {".ts", ".tsx", ".json", ".md"}:
        continue
    if path in {LEGACY, REVIEWED, RUNTIME, AUTHORITY}:
        continue
    text = path.read_text(encoding="utf-8")
    updated = text.replace(
        "canonical-courier-reviewed-base",
        "canonical-courier-booking-authority",
    ).replace(
        "canonical-courier-legacy",
        "canonical-courier-effect-runtime",
    )
    if updated != text:
        path.write_text(updated, encoding="utf-8")

source_contract = ROOT / "src/lib/integrations/delivery/__tests__/provider-authority-source-contract.test.ts"
contract = source_contract.read_text(encoding="utf-8")
contract = replace_once(
    contract,
    'import { existsSync, readFileSync } from "node:fs";',
    'import { existsSync, readFileSync, readdirSync } from "node:fs";',
    "source contract fs import",
)
insert_marker = 'describe("Phase 3 delivery provider authority source contract", () => {\n'
new_test = '''describe("Phase 3 delivery provider authority source contract", () => {
  it("exposes one public courier facade and internalizes effect execution", () => {
    const legacy = resolve(root, "src/lib/delivery/canonical-courier-legacy.ts");
    const reviewed = resolve(
      root,
      "src/lib/delivery/canonical-courier-reviewed-base.ts",
    );
    const authorityPath =
      "src/lib/delivery/canonical-courier-booking-authority.ts";
    const runtimePath =
      "src/lib/delivery/canonical-courier-effect-runtime.ts";
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(reviewed)).toBe(false);
    expect(existsSync(resolve(root, authorityPath))).toBe(true);
    expect(existsSync(resolve(root, runtimePath))).toBe(true);

    const facade = source("src/lib/delivery/canonical-courier.ts");
    const authority = source(authorityPath);
    const runtime = source(runtimePath);
    expect(facade).toContain("./canonical-courier-booking-authority");
    expect(authority).toContain("./canonical-courier-effect-runtime");
    expect(runtime).not.toContain(
      "export async function queueCanonicalCourierBooking",
    );
    expect(runtime).not.toContain(
      "export async function reconcileCanonicalCourierBooking",
    );

    const deliveryFiles = readdirSync(resolve(root, "src/lib/delivery"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `src/lib/delivery/${name}`);
    const runtimeImporters = deliveryFiles.filter((path) =>
      source(path).includes("./canonical-courier-effect-runtime"),
    );
    expect(runtimeImporters).toEqual([authorityPath]);
  });
'''
if insert_marker not in contract:
    raise SystemExit("source contract describe marker missing")
contract = contract.replace(insert_marker, new_test, 1)
source_contract.write_text(contract, encoding="utf-8")

LEGACY.unlink()
REVIEWED.unlink()

print("Task 6 courier facade consolidation applied")
