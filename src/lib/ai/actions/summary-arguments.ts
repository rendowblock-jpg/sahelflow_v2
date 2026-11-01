/**
 * The arguments a person approves, copied into the stored proposal summary
 * exactly as the executor will use them. The approval card reads them from
 * there, so what is shown is what runs. An optional argument the request left
 * out is stored as null, never left off: that is how a card tells a complete
 * summary from one written before these fields existed.
 */
type Args = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function whole(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function exactArgumentFields(
  toolName: string,
  args: Args,
): Record<string, unknown> {
  switch (toolName) {
    case "cancel_order":
    case "update_product_stock":
      return { reason: text(args.reason) };
    case "create_product":
      return { cost: whole(args.cost) };
    case "create_customer":
      return {
        phone: text(args.phone),
        phone2: text(args.phone2),
        commune: text(args.commune),
        address: text(args.address),
        notes: text(args.notes),
      };
    case "update_customer_notes":
      return { notes: String(args.notes) };
    default:
      return {};
  }
}
