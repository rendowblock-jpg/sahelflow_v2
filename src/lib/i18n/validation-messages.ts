/**
 * Form validation messages in the seller's language.
 *
 * Client schemas (src/lib/validation) keep stable English messages because
 * the same schemas validate API input. Anything a form renders goes through
 * this map first: exact schema messages, then zod's built-in defaults, then
 * the message unchanged.
 */
type TFunc = (key: string, params?: Record<string, string | number>) => string;

const EXACT: Record<string, string> = {
  "Wilaya is required": "validation.wilayaRequired",
  "Commune is required": "validation.communeRequired",
  "Address is required": "validation.addressRequired",
  "At least one item is required": "validation.itemsRequired",
  "At least one item required": "validation.itemsRequired",
  "Customer name is required": "validation.customerNameRequired",
  "Date is required": "validation.dateRequired",
  "Product is required": "validation.productRequired",
  "Quantity must be at least 1": "validation.quantityMin",
  "Price cannot be negative": "validation.priceNonNegative",
  "Delivery cost cannot be negative": "validation.deliveryCostNonNegative",
  "Phone is required": "validation.phoneRequired",
  "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)": "validation.phoneInvalid",
  "Please select a customer or create a new one": "validation.selectCustomer",
  "Please select an exact product variant": "validation.selectVariant",
  "Confirmation blocked (imported order)": "validation.importedConfirmationBlocked",
  "Invalid ID format": "validation.invalid",
  Required: "validation.required",
};

export function translateValidationMessage(message: string, t: TFunc): string {
  const exact = EXACT[message];
  if (exact) return t(exact);
  // zod v4 defaults ("Too small: expected string to have >=1 characters", …)
  if (/^Too small: expected string to have >=1 characters?$/i.test(message)) {
    return t("validation.required");
  }
  if (/^Too small/i.test(message)) return t("validation.tooSmall");
  if (/^Too big/i.test(message)) return t("validation.tooLarge");
  if (/^Invalid input: expected (number|int)/i.test(message)) return t("validation.numberExpected");
  if (/^Invalid input: expected .*received undefined$/i.test(message)) return t("validation.required");
  if (/^Invalid (input|option|string|format|enum)/i.test(message)) return t("validation.invalid");
  // zod v3 defaults
  if (/^Expected number, received/i.test(message)) return t("validation.numberExpected");
  if (/^String must contain at least 1 character/i.test(message)) return t("validation.required");
  if (/^(String|Number) must (contain at least|be greater than or equal to)/i.test(message)) {
    return t("validation.tooSmall");
  }
  if (/^(String|Number) must (contain at most|be less than or equal to)/i.test(message)) {
    return t("validation.tooLarge");
  }
  if (/^Invalid (email|url|enum value|input|date)/i.test(message)) return t("validation.invalid");
  return message;
}
