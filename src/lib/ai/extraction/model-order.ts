/**
 * The shared reading of a model's JSON answer: one bounded schema and one
 * canonical form (phones, wilayas, catalog names) for every AI provider.
 * Moved out of gemini-extractor.ts unchanged so Groq reads orders the same way.
 */
import { z } from "zod";
import { matchCatalog } from "./catalog";
import { normalizePhone } from "./fields";
import { canonicalWilaya } from "./geography";
import { communeRepeatsWilaya, numbersInMessage, priceIsWritten } from "./grounding";
import type { ExtractedOrder, ExtractionInput } from "./types";

const numeric = (label: string, min = 0) => z.union([
  z.number().min(min),
  z.string().transform((value, ctx) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min) {
      ctx.addIssue({ code: "custom", message: `Invalid ${label}` });
      return z.NEVER;
    }
    return number;
  }),
]);

export const ExtractedOrderSchema = z.object({
  customerName: z.string().optional(),
  phone: z.string().optional(),
  wilaya: z.string().optional(),
  commune: z.string().optional(),
  address: z.string().optional(),
  // Audit S3-18: a misbehaving model response must not inject an unbounded
  // item list into the proposal path.
  items: z.array(z.object({
    productName: z.string(),
    quantity: numeric("quantity", 1).transform((value) => Math.trunc(value)),
    unitPrice: numeric("unitPrice").optional(),
  })).max(200),
  totalPrice: numeric("totalPrice").optional(),
  notes: z.string().optional(),
});

/**
 * Longest text the order route accepts per field
 * (src/app/api/orders/source/whatsapp/route.ts:28-43). A longer model value
 * would make the draft fail on submit, so it is cut here instead.
 */
const TEXT_CAPS = { customerName: 200, commune: 120, address: 500, notes: 2000, productName: 300 } as const;

/**
 * A model answer is held to the same canonical forms as the offline reader
 * (FD-064): 0XXXXXXXXX phones, official wilaya names, catalog item names.
 * A value that cannot be made canonical is dropped and reported missing
 * rather than passed on to order creation.
 *
 * With the message (`input.body`) the answer is also held to it: a price the
 * message does not contain is dropped, and so is a commune that only repeats
 * the wilaya without being backed by the message. Without it (the screenshot reader,
 * which has no text) nothing is checked.
 */
export function canonicalizeOrder(
  order: z.infer<typeof ExtractedOrderSchema>,
  input: Pick<ExtractionInput, "catalog" | "knownPhone"> & Partial<Pick<ExtractionInput, "body">>,
): ExtractedOrder {
  const written = typeof input.body === "string" ? numbersInMessage(input.body) : undefined;
  const stated = (price: number | undefined): price is number =>
    price !== undefined && (written === undefined || priceIsWritten(price, written));
  const phone = normalizePhone(order.phone) ?? normalizePhone(input.knownPhone);
  const wilaya = canonicalWilaya(order.wilaya);
  const clean = (value: string | undefined, max: number) =>
    value?.replace(/\s+/g, " ").trim().slice(0, max).trimEnd() || undefined;
  const customerName = clean(order.customerName, TEXT_CAPS.customerName);
  const writtenCommune = clean(order.commune, TEXT_CAPS.commune);
  const commune =
    writtenCommune && typeof input.body === "string" &&
    communeRepeatsWilaya(writtenCommune, { canonical: wilaya, written: order.wilaya }, input.body)
      ? undefined
      : writtenCommune;
  const address = clean(order.address, TEXT_CAPS.address);
  const notes = clean(order.notes, TEXT_CAPS.notes);
  const items = order.items
    .map((item) => ({ ...item, productName: clean(item.productName, TEXT_CAPS.productName) ?? "" }))
    .filter((item) => item.productName)
    .map((item) => {
      const quantity = Math.min(Math.max(item.quantity, 1), 999);
      const match = matchCatalog(item.productName, input.catalog);
      return {
        productName: match?.name ?? item.productName,
        quantity,
        ...(stated(item.unitPrice) ? { unitPrice: Math.round(item.unitPrice) } : {}),
        ...(match ? { catalogMatch: match.kind } : {}),
        ...(match && match.name !== item.productName ? { sourceText: item.productName } : {}),
      };
    });
  return {
    items,
    ...(customerName ? { customerName } : {}),
    ...(phone ? { phone } : {}),
    ...(wilaya ? { wilaya } : {}),
    ...(commune ? { commune } : {}),
    ...(address ? { address } : {}),
    ...(stated(order.totalPrice) ? { totalPrice: Math.round(order.totalPrice) } : {}),
    ...(notes ? { notes } : {}),
  };
}
