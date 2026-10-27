/**
 * Offline order extractor — reads Algerian COD messages without AI (FD-064).
 *
 * Runs entirely on the device, instantly and for free, and is the first
 * reader of every message. The order of work matters:
 *   1. phones are found and blanked (a phone is never a price);
 *   2. the customer's name is read (stopping at a wilaya or a phone);
 *   3. wilaya mentions are scored by delivery cue and blanked;
 *   4. the commune and a labelled address are read and blanked;
 *   5. what remains is split into clauses and read as order lines,
 *      mapped onto the seller's catalog when one is supplied.
 * Anything it cannot read confidently is left for Gemini (when the seller
 * enabled it) and for the review sheet.
 */
import { findCommune, chooseWilaya, findWilayaMentions, wilayaName } from "./geography";
import { findCustomerName, findLabelledAddress, findPhones, normalizePhone, pickPhone } from "./fields";
import { readItems } from "./items";
import { INJECTION_OBJECTS, INJECTION_PHRASES, INJECTION_VERBS } from "./lexicon";
import { B_AFTER, B_BEFORE, fold, mask, normalizeMessage, phraseAlternation } from "./text";
import type { ExtractedOrder, ExtractionInput, ExtractionResult } from "./types";

export { normalizePhone } from "./fields";
export { canonicalWilaya } from "./geography";

/**
 * "Ignore the previous instructions …": a customer cannot instruct the reader.
 * From the first such phrase to the end, the text is not read at all, so an
 * order written before it survives and a message that is only an instruction
 * is no order.
 *
 * Ordinary delivery requests share those words, and the customer's phone and
 * address come after them, so a phrase is NOT an instruction when
 *  - the verb is negated ("n'oubliez pas les consignes", "do not forget the
 *    instructions", "forget not");
 *  - the words between the verb and the object, or the words right after the
 *    object, are about delivery or about an earlier order ("ignore the delivery
 *    instructions", "ignorez les consignes de la dernière fois").
 * "ignore all instructions from now on", "oubliez toutes les instructions
 * précédentes", "forget your rules" stay instructions.
 */
const INJECTION_VERB = new RegExp(`${B_BEFORE}(?:${phraseAlternation(INJECTION_VERBS)})${B_AFTER}`, "gu");
const INJECTION_OBJECT_TAIL = new RegExp(
  `(?:\\s+\\S+){0,3}?\\s+(?:${phraseAlternation(INJECTION_OBJECTS)})${B_AFTER}`,
  "uy",
);
const INJECTION_PHRASE = new RegExp(`${B_BEFORE}(?:${phraseAlternation(INJECTION_PHRASES)})${B_AFTER}`, "u");
/** Right before the verb: "n'", "ne ", "do not ", "don't ", "never ", Arabic "ما " / "لا ". */
const NEGATED_BEFORE = /(?:(?:^|[\s,.;:!?(])(?:n|ne|not|dont|never|jamais|ما|لا)['’]?\s*|n['’]t\s+)$/u;
/** Right after the verb: "oubliez pas", "forget not". */
const NEGATED_AFTER = /^\s*(?:pas|plus|jamais|not|never)(?![\p{L}\p{N}])/u;
/** Words that make "instructions" a delivery or earlier-order matter. */
const ABOUT_DELIVERY_WORD = /(?:livraison|livrer|delivery|deliver|commande|order|colis|expedition|توصيل|الطلب|طلبية)/u;
const ABOUT_EARLIER_TAIL =
  /^\s*(?:de|du|des|d['’]|of|for|about|concernant|ta3|mta3|تاع|ديال)\s*(?:la\s+|le\s+|l['’]\s*|ma\s+|mon\s+|the\s+|my\s+)?(?:derniere|dernier|precedente|livraison|commande|colis|expedition|delivery|order|last|previous|المرة|التوصيل|الطلب|طلبية)/u;

/** Offset of the first real instruction phrase in the folded text, or -1. */
function findInjectionStart(folded: string): number {
  let first = -1;
  const phrase = INJECTION_PHRASE.exec(folded);
  if (phrase) first = phrase.index;
  INJECTION_VERB.lastIndex = 0;
  for (let verb = INJECTION_VERB.exec(folded); verb; verb = INJECTION_VERB.exec(folded)) {
    if (first !== -1 && verb.index > first) break;
    const afterVerb = verb.index + verb[0].length;
    if (NEGATED_BEFORE.test(folded.slice(Math.max(0, verb.index - 12), verb.index))) continue;
    if (NEGATED_AFTER.test(folded.slice(afterVerb, afterVerb + 12))) continue;
    INJECTION_OBJECT_TAIL.lastIndex = afterVerb;
    const object = INJECTION_OBJECT_TAIL.exec(folded);
    if (!object) continue;
    if (ABOUT_DELIVERY_WORD.test(object[0])) continue;
    const afterObject = afterVerb + object[0].length;
    if (ABOUT_EARLIER_TAIL.test(folded.slice(afterObject, afterObject + 40))) continue;
    first = verb.index;
    break;
  }
  return first;
}

/**
 * Everything the offline reader found, including the fields of a message
 * that names no item (the router uses them to complete a Gemini answer).
 */
export function readOrderFields(input: ExtractionInput): { order: ExtractedOrder; hasName: boolean } {
  let original = normalizeMessage(input.body);
  let folded = fold(original);
  const blank = (start: number, end: number) => {
    original = mask(original, start, end);
    folded = mask(folded, start, end);
  };

  const injectionStart = findInjectionStart(folded);
  if (injectionStart !== -1) blank(injectionStart, folded.length);

  const phones = findPhones(folded);
  const chosenPhone = pickPhone(phones, folded);
  for (const phone of phones) blank(phone.start, phone.end);

  let mentions = findWilayaMentions(folded);
  const name = findCustomerName(original, folded, new Set(mentions.map((mention) => mention.start)));
  if (name) {
    blank(name.start, name.end);
    mentions = mentions.filter((mention) => mention.end <= name.start || mention.start >= name.end);
  }
  let wilayaCode = chooseWilaya(mentions);
  for (const mention of mentions) blank(mention.start, mention.end);

  const commune = findCommune(folded, wilayaCode);
  if (commune) {
    blank(commune.start, commune.end);
    wilayaCode ??= commune.wilayaCode;
  }

  const labelledAddress = findLabelledAddress(original, folded);
  if (labelledAddress) blank(labelledAddress.start, labelledAddress.end);

  const lines = readItems(original, folded, input.catalog);
  const items = lines.items;
  const wilaya = wilayaName(wilayaCode);
  // A knownPhone that cannot be normalised is not a phone: counting it would mark
  // the order complete and skip the model for a conversation id (S06b-12).
  const phone = chosenPhone ?? normalizePhone(input.knownPhone);
  const address = labelledAddress?.value ?? lines.address;
  const customerName = name?.value ?? lines.signatureName;

  const order: ExtractedOrder = {
    items,
    ...(customerName ? { customerName } : {}),
    ...(phone ? { phone } : {}),
    ...(wilaya ? { wilaya } : {}),
    ...(commune ? { commune: commune.name } : {}),
    ...(address ? { address } : {}),
    ...(lines.totalPrice !== undefined ? { totalPrice: lines.totalPrice } : {}),
    ...(lines.notes ? { notes: lines.notes } : {}),
  };

  return { order, hasName: Boolean(customerName) };
}

export function extractWithRegex(input: ExtractionInput): ExtractionResult {
  const { order, hasName } = readOrderFields(input);
  const { items, wilaya, phone } = order;
  const missingFields: string[] = [];
  if (items.length === 0) missingFields.push("items");
  if (!wilaya) missingFields.push("wilaya");
  if (!phone) missingFields.push("phone");

  let confidence = 0;
  if (items.length > 0) confidence += 0.4;
  if (wilaya) confidence += 0.25;
  if (phone) confidence += 0.2;
  if (hasName) confidence += 0.15;

  return {
    order: items.length > 0 ? order : null,
    method: items.length > 0 ? "regex" : "none",
    confidence: Math.round(confidence * 100) / 100,
    isComplete: missingFields.length === 0,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    ...(items.length === 0 && (wilaya || phone || hasName) ? { partial: order } : {}),
  };
}
