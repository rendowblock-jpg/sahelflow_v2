/**
 * Nested-result PII decryption helper.
 *
 * Background: Prisma's `$extends` query callbacks only fire for the TOP-LEVEL
 * model in a query. Nested includes bypass the extension entirely — the nested
 * rows are returned as-is from the DB (ciphertext for PII fields). Verified
 * by `src/lib/__tests__/pii-nested-includes.test.ts`.
 *
 * This helper closes that gap. After the top-level handler decrypts its own
 * PII fields, it calls `decryptNestedPii(result)` to walk the result tree and
 * decrypt any nested customer/order/conversation rows.
 *
 * Recurses into arrays and objects. Recognizes the following nested relation
 * keys (matching the Prisma schema's relation field names):
 *   - `customer`      → decryptCustomerRow (handles name/phone2/address/notes + phone blind index)
 *   - `order`         → decryptPiiRow(ORDER_PII_FIELDS) (phone/address/notes)
 *   - `orders`        → array of decryptPiiRow(ORDER_PII_FIELDS)
 *   - `conversation`  → decryptPiiRow(CONVERSATION_PII_FIELDS) (contactName/contactPhone)
 *   - `conversations` → array of decryptPiiRow(CONVERSATION_PII_FIELDS)
 *   - `messages`      → recurse only (Message.body not yet encrypted — see S-010 TODO)
 *
 * Skips: keys starting with `_` (Prisma internal meta like `_count`, `_sum`).
 *
 * IMPORTANT: this function MUTATES the result object in place (and returns it).
 * The result objects are freshly created by Prisma per query, so mutation is
 * safe — no shared-state risk.
 */

import type { RecordString } from "@/types/runtime";
import { decryptCustomerRow, ensurePhoneEncSelected } from "./customer-encryption";
import {
  decryptPiiRow,
  ORDER_PII_FIELDS,
  CONVERSATION_PII_FIELDS,
  MESSAGE_PII_FIELDS,
} from "./pii-fields";

/**
 * Decrypt nested PII rows in a Prisma result tree.
 * Call this AFTER the top-level handler has decrypted its own PII fields.
 */
export function decryptNestedPii(result: unknown): unknown {
  if (result === null || result === undefined) return result;
  if (Array.isArray(result)) {
    return result.map(decryptNestedPii);
  }
  if (typeof result !== "object") return result;

  const row = result as RecordString;

  // Decrypt nested single-model relations
  if ("customer" in row && row.customer && typeof row.customer === "object") {
    row.customer = decryptCustomerRow(row.customer as RecordString);
    // Recurse into the customer for any further nested relations (e.g. customer.orders)
    decryptNestedPii(row.customer);
  }
  if ("order" in row && row.order && typeof row.order === "object") {
    row.order = decryptPiiRow(row.order as RecordString, ORDER_PII_FIELDS);
    decryptNestedPii(row.order);
  }
  if ("conversation" in row && row.conversation && typeof row.conversation === "object") {
    row.conversation = decryptPiiRow(row.conversation as RecordString, CONVERSATION_PII_FIELDS);
    decryptNestedPii(row.conversation);
  }

  // Decrypt nested collection relations
  if ("orders" in row && Array.isArray(row.orders)) {
    row.orders = row.orders.map((o: unknown) => {
      const decrypted = decryptPiiRow(o as RecordString, ORDER_PII_FIELDS);
      decryptNestedPii(decrypted);
      return decrypted;
    });
  }
  if ("conversations" in row && Array.isArray(row.conversations)) {
    row.conversations = row.conversations.map((c: unknown) => {
      const decrypted = decryptPiiRow(c as RecordString, CONVERSATION_PII_FIELDS);
      decryptNestedPii(decrypted);
      return decrypted;
    });
  }
  // Message.body IS encrypted (MESSAGE_PII_FIELDS). Decrypt each message,
  // then recurse in case messages have their own nested relations.
  if ("messages" in row && Array.isArray(row.messages)) {
    row.messages = row.messages.map((m: unknown) => {
      const decrypted = decryptPiiRow(m as RecordString, MESSAGE_PII_FIELDS);
      decryptNestedPii(decrypted);
      return decrypted;
    });
  }

  return row;
}

/**
 * Walk a Prisma query's `include` tree and ensure any nested `customer`
 * include selects `phoneEnc` when `phone` is selected.
 *
 * WHY: Prisma's `$extends` query callbacks only fire for the TOP-LEVEL model.
 * When `db.order.findMany({ include: { customer: { select: { phone: true } } } })`
 * runs, the customer handler does NOT fire — so its `ensurePhoneEncSelected`
 * (which auto-adds `phoneEnc` to the select) doesn't run either. The nested
 * customer row is returned with `phone` (the blind index) but WITHOUT
 * `phoneEnc` (the encrypted actual phone). `decryptCustomerRow` then can't
 * decrypt the phone — it stays as the blind-index hex string.
 *
 * This function closes that gap by pre-walking the include tree BEFORE the
 * query runs and adding `phoneEnc` to any nested customer select that
 * includes `phone`. Call it in the order/conversation handlers' read paths
 * (findMany/findUnique/findFirst) before `query(args)`.
 *
 * Recurses into nested includes (e.g. `order.customer.orders.customer`).
 */
export function ensureNestedCustomerPhoneEnc(args: {
  include?: unknown;
  select?: unknown;
}): void {
  const include = args.include as RecordString | undefined;
  if (!include || typeof include !== "object") return;

  for (const [key, value] of Object.entries(include)) {
    if (key === "customer" && value && typeof value === "object") {
      const customerInclude = value as {
        select?: Record<string, boolean>;
        include?: Record<string, boolean>;
      };
      // Reuse the existing helper to add phoneEnc if needed
      const fixed = ensurePhoneEncSelected({
        select: customerInclude.select,
        include: customerInclude.include,
      });
      if (fixed.select) customerInclude.select = fixed.select;
      if (fixed.include) customerInclude.include = fixed.include;
      // Recurse into the customer's own includes (e.g. customer.orders)
      ensureNestedCustomerPhoneEnc(customerInclude);
    } else if (value && typeof value === "object") {
      // Recurse into other relations (e.g. order.items, conversation.messages)
      ensureNestedCustomerPhoneEnc(value as { include?: unknown; select?: unknown });
    }
  }
}
