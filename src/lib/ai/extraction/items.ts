/**
 * Order lines from a message (FD-064): split into clauses, read each clause,
 * then assemble. A clause that only states a price ("thmano khamsa alaf",
 * "4500 da koll wahda", "tshirts 1500 le koll") prices an item already named
 * instead of inventing a new one; a clause with no quantity, price or order
 * verb is conversation, not an item. A product asked about ("disponible ?")
 * is still the order when the same message also asks for delivery or says
 * "je veux" / "نحب". A warranty question with no order is not an item.
 */
import { findCatalogSpans, matchCatalog, productTokens, sameProduct, type ExtractionCatalogEntry } from "./catalog";
import { readClause } from "./clause";
import { B_AFTER, B_BEFORE, fold } from "./text";
import type { ExtractedItem } from "./types";

export interface ItemsReading {
  items: ExtractedItem[];
  /** A bare "Nadia" or "أمينة شريف" line: a signature, not a product. */
  signatureName?: string;
  totalPrice?: number;
  address?: string;
  notes?: string;
}

interface Clause {
  start: number;
  end: number;
  conjunction: boolean;
  /** Joined to the previous clause by "+" or "&": an itemized list. */
  list: boolean;
  question: boolean;
}

const SEPARATOR = new RegExp(
  `\\n|[,،;؛](?!\\d)|:(?!\\d)|(?<question>[?؟]+)|!+|\\.(?=\\s|$)|(?<list>\\s[+&]\\s)|${B_BEFORE}(?<conjunction>w|و|et|and)${B_AFTER}(?!\\s*(?:nos|nass|nes|نص|نصف|demi))`,
  "gu",
);

function splitClauses(folded: string, protectedSpans: ReadonlyArray<{ start: number; end: number }>): Clause[] {
  const clauses: Clause[] = [];
  let start = 0;
  let conjunction = false;
  let list = false;
  for (const match of folded.matchAll(SEPARATOR)) {
    const at = match.index ?? 0;
    if (protectedSpans.some((span) => at >= span.start && at < span.end)) continue;
    clauses.push({ start, end: at, conjunction, list, question: Boolean(match.groups?.question) });
    start = at + match[0].length;
    list = Boolean(match.groups?.list);
    conjunction = Boolean(match.groups?.conjunction) || list;
  }
  clauses.push({ start, end: folded.length, conjunction, list, question: false });
  return clauses.filter((clause) => folded.slice(clause.start, clause.end).trim());
}

const SIGNATURE_WORD = /^(?:\p{Lu}[\p{Ll}'-]+|\p{Script=Arabic}{2,})$/u;
const DELIVERY_LINE = /(?:livraison|livrer|توصيل|التوصيل|tawsil|twsil|twsl|delivery)/u;
const PAYMENT_LINE = /(?:عند الاستلام|الدفع عند|cash on delivery|paiement)/u;
const COLOR_WORDS = new Set(
  [
    "noir", "noire", "noirs", "black", "blanc", "blanche", "beige", "vert", "verte",
    "rouge", "bleu", "bleue", "rose", "gris", "grise", "marron", "camel", "dore", "gold",
    "brown", "green", "white", "اسود", "كحل", "ابيض", "بيضاء", "احمر", "ازرق", "اخضر", "بيج", "رمادي",
  ].map((word) => fold(word)),
);

function colorPhrase(name: string): string | undefined {
  const tokens = productTokens(name).filter((token) => COLOR_WORDS.has(token));
  const all = productTokens(name);
  if (all.length === 0 || tokens.length !== all.length) return undefined;
  return tokens.join(" ");
}

function clampQty(quantity: number | undefined): number {
  return Math.min(Math.max(quantity ?? 1, 1), 999);
}

/** One to three name-shaped words and nothing else. */
function signatureName(text: string): string | undefined {
  const words = text.replace(/[.!]+$/u, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return undefined;
  return words.every((word) => SIGNATURE_WORD.test(word)) ? words.join(" ") : undefined;
}

export function readItems(
  original: string,
  folded: string,
  catalog?: readonly ExtractionCatalogEntry[],
): ItemsReading {
  const items: ExtractedItem[] = [];
  const reading: ItemsReading = { items };
  const addressParts: string[] = [];
  const notes: string[] = [];
  let previousWasItem = false;
  let previousWasAddress = false;
  // "Sac à Main Femme + Parfum Oud": the first entry of a list is an item
  // once the entry joined to it is one.
  let pendingListItem: ExtractedItem | undefined;
  // A product named before the customer says "je veux" / "نحب" or asks for delivery.
  let mention: { name: string; quantity: number } | undefined;

  const parsed = splitClauses(folded, findCatalogSpans(folded, catalog)).map((clause) => {
    const text = original.slice(clause.start, clause.end);
    const clauseFolded = folded.slice(clause.start, clause.end);
    return { clause, text, clauseFolded, line: readClause(text, clauseFolded) };
  });
  const messageOrders = parsed.some((row) => row.line.intent || DELIVERY_LINE.test(row.clauseFolded));

  for (const { clause, text, clauseFolded, line } of parsed) {
    if (line.address || (line.addressContinuation && previousWasAddress)) {
      addressParts.push((line.address ?? line.addressContinuation)!);
      previousWasAddress = true;
      previousWasItem = false;
      continue;
    }
    previousWasAddress = false;

    if (line.attribute && items.length > 0 && previousWasItem) {
      const last = items[items.length - 1]!;
      last.productName = `${last.productName} ${line.attribute}`.trim();
      continue;
    }

    if (line.total && line.price !== undefined && !line.name) {
      reading.totalPrice = line.price;
      continue;
    }

    const deliveryOrPayment =
      (DELIVERY_LINE.test(clauseFolded) || PAYMENT_LINE.test(clauseFolded)) &&
      !line.quantityStated &&
      line.price === undefined;
    if (deliveryOrPayment) {
      previousWasItem = false;
      continue;
    }

    if (line.name) {
      const onlyColor = !line.intent && !line.quantityStated && line.price === undefined ? colorPhrase(line.name) : undefined;
      if (onlyColor) {
        notes.push(onlyColor);
        continue;
      }
      // "Oud & Ambre" is one product. "Sac + Parfum Oud" is two: the second has two words.
      if (
        clause.list &&
        previousWasItem &&
        items.length > 0 &&
        !line.quantityStated &&
        line.price === undefined &&
        !line.intent &&
        productTokens(line.name).length <= 1
      ) {
        const last = items[items.length - 1]!;
        last.productName = `${last.productName} ${line.name}`.replace(/\s+/g, " ").trim();
        continue;
      }

      const catalogMatch = matchCatalog(line.name, catalog);
      const evidence =
        line.quantityStated ||
        line.price !== undefined ||
        line.intent ||
        (clause.conjunction && previousWasItem) ||
        catalogMatch !== undefined;
      const bareQuestion = clause.question && !line.quantityStated && line.price === undefined && !line.intent;
      // "est disponible ?" is the order when the message also asks for delivery.
      // "est-il garanti ?" with no order is not.
      const blockedQuestion = bareQuestion && !messageOrders;
      if (!evidence && clause.list && pendingListItem) {
        items.push(pendingListItem);
      } else if (!evidence || blockedQuestion) {
        const signature = !clause.question && !line.intent ? signatureName(text) : undefined;
        if (signature && items.length > 0) reading.signatureName ??= signature;
        if (!blockedQuestion) {
          mention = { name: line.name, quantity: clampQty(line.quantity) };
        }
        pendingListItem = clause.question ? undefined : { productName: line.name, quantity: clampQty(line.quantity) };
        previousWasItem = false;
        continue;
      }
      if (clause.list && pendingListItem) items.push(pendingListItem);
      pendingListItem = undefined;
      // "tshirts 1500 le koll" after "2 tshirts": a price for a named item.
      if (!line.quantityStated && line.price !== undefined && !line.intent) {
        const named = items.find((item) => item.unitPrice === undefined && sameProduct(item.productName, line.name!));
        if (named) {
          named.unitPrice = line.price;
          previousWasItem = true;
          continue;
        }
      }
      if (line.exchange) notes.push(text.replace(/\s+/g, " ").trim());
      items.push({
        productName: line.name,
        quantity: clampQty(line.quantity),
        ...(line.price !== undefined && !line.total ? { unitPrice: line.price } : {}),
      });
      if (line.total && line.price !== undefined) reading.totalPrice = line.price;
      previousWasItem = true;
      mention = undefined;
      continue;
    }

    if ((line.intent || line.quantityStated) && !line.name && items.length === 0 && mention) {
      items.push({ productName: mention.name, quantity: clampQty(line.quantity ?? mention.quantity) });
      mention = undefined;
      previousWasItem = true;
      continue;
    }
    // "شفت imprimante. نحب زوج" — the quantity is in the next clause.
    if (line.quantityStated && !line.name && items.length === 1) {
      items[0]!.quantity = clampQty(line.quantity);
      previousWasItem = true;
      continue;
    }

    if (line.price !== undefined) {
      // A bare price prices the latest item still without one.
      const target = [...items].reverse().find((item) => item.unitPrice === undefined);
      if (target) target.unitPrice = line.price;
      else if (items.length > 0 && reading.totalPrice === undefined && line.total) reading.totalPrice = line.price;
      continue;
    }
    previousWasItem = false;
  }

  if (items.length === 0 && mention && messageOrders) {
    items.push({ productName: mention.name, quantity: mention.quantity });
  }

  // Same product written twice with the same price is one line.
  const merged: ExtractedItem[] = [];
  for (const item of items) {
    const twin = merged.find(
      (candidate) => candidate.productName.toLowerCase() === item.productName.toLowerCase() && candidate.unitPrice === item.unitPrice,
    );
    if (twin) twin.quantity = Math.min(twin.quantity + item.quantity, 999);
    else merged.push(item);
  }
  reading.items = merged.map((item) => {
    const colors = productTokens(item.productName).filter((token) => COLOR_WORDS.has(token));
    if (colors.length) notes.push(colors.join(" "));
    const match = matchCatalog(item.productName, catalog);
    if (!match) return item;
    return {
      ...item,
      productName: match.name,
      catalogMatch: match.kind,
      ...(match.name !== item.productName ? { sourceText: item.productName } : {}),
    };
  });
  if (addressParts.length) reading.address = addressParts.join(", ");
  if (notes.length) reading.notes = notes.join(" · ");
  return reading;
}
