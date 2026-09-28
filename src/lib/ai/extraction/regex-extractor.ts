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
import { findCustomerName, findLabelledAddress, findPhones, normalizePhone } from "./fields";
import { readItems } from "./items";
import { fold, mask, normalizeMessage } from "./text";
import type { ExtractedOrder, ExtractionInput, ExtractionResult } from "./types";

export { normalizePhone } from "./fields";
export { canonicalWilaya } from "./geography";

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

  const phones = findPhones(folded);
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
  const phone = phones[0]?.value ?? normalizePhone(input.knownPhone) ?? input.knownPhone;
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
