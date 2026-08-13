import {
  BASE64,
  ID,
  ITEM_KEY,
  MAX_CHECKOUT_ITEMS,
  MAX_CIPHERTEXT_CHARS,
  WILAYA,
} from "./shared";
import { parseStorefrontCustomerCiphertext } from "./receipt-protocol";

export type CheckoutLineInput = { itemKey: string; quantity: number };

export type ParsedCheckoutInput = {
  idempotencyKey: string;
  encryptedCustomer: string;
  wrappedCustomerKey: string;
  customerAadDigest: string;
  wilayaCode: string;
  deliveryMode: "home" | "desk";
  items: CheckoutLineInput[];
};

export function parseCheckoutInput(value: unknown): ParsedCheckoutInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const idempotencyKey = String(input.idempotencyKey ?? "");
  const encryptedCustomer = String(input.encryptedCustomer ?? "");
  const wrappedCustomerKey = String(input.wrappedCustomerKey ?? "");
  const wilayaCode = String(input.wilayaCode ?? "");
  const deliveryMode = input.deliveryMode;
  const customerCiphertext = parseStorefrontCustomerCiphertext(encryptedCustomer);
  if (
    !ID.test(idempotencyKey) ||
    !BASE64.test(encryptedCustomer) ||
    encryptedCustomer.length > MAX_CIPHERTEXT_CHARS ||
    !customerCiphertext ||
    !BASE64.test(wrappedCustomerKey) ||
    wrappedCustomerKey.length < 16 ||
    wrappedCustomerKey.length > 4096 ||
    !WILAYA.test(wilayaCode) ||
    (deliveryMode !== "home" && deliveryMode !== "desk") ||
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > MAX_CHECKOUT_ITEMS
  ) return null;

  const items: CheckoutLineInput[] = [];
  const seen = new Set<string>();
  for (const raw of input.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const itemKey = String(row.itemKey ?? "");
    const quantity = Number(row.quantity);
    if (
      !ITEM_KEY.test(itemKey) ||
      seen.has(itemKey) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) return null;
    seen.add(itemKey);
    items.push({ itemKey, quantity });
  }
  items.sort((left, right) => left.itemKey.localeCompare(right.itemKey));
  return {
    idempotencyKey,
    encryptedCustomer,
    wrappedCustomerKey,
    customerAadDigest: customerCiphertext.aadDigest,
    wilayaCode,
    deliveryMode,
    items,
  };
}
