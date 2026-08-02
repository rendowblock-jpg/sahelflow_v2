/**
 * Import field configs — expected fields + aliases for auto-detecting column
 * mappings. Aliases cover French, English, and Arabic common column names.
 */

export interface FieldConfig {
  key: string;
  i18nKey: string;
  aliases: string[];
  required: boolean;
}

export const PRODUCT_FIELDS: FieldConfig[] = [
  {
    key: "name",
    i18nKey: "products.name",
    aliases: ["nom", "produit", "product", "designation", "title"],
    required: true,
  },
  {
    key: "sku",
    i18nKey: "products.sku",
    aliases: ["ref", "reference", "code", "barcode", "ean"],
    required: false,
  },
  {
    key: "price",
    i18nKey: "products.price",
    aliases: ["prix", "price", "montant", "amount", "cout"],
    required: true,
  },
  {
    key: "cost",
    i18nKey: "products.cost",
    aliases: ["cout_achat", "cost", "achat", "wholesale"],
    required: false,
  },
  {
    key: "stock",
    i18nKey: "products.stock",
    aliases: ["quantite", "qty", "quantity", "inventory"],
    required: false,
  },
  {
    key: "category",
    i18nKey: "products.category",
    aliases: ["categorie", "category", "type"],
    required: false,
  },
  {
    key: "lowStockThreshold",
    i18nKey: "products.lowStockThreshold",
    aliases: ["seuil", "min_stock", "reorder"],
    required: false,
  },
];

export const CUSTOMER_FIELDS: FieldConfig[] = [
  {
    key: "name",
    i18nKey: "customers.name",
    aliases: ["nom", "client", "customer", "name", "fullname", "client_name"],
    required: true,
  },
  {
    key: "phone",
    i18nKey: "customers.phone",
    aliases: ["tel", "telephone", "phone", "mobile", "gsm", "numero"],
    required: true,
  },
  {
    key: "phone2",
    i18nKey: "customers.phone2",
    aliases: ["tel2", "phone2", "mobile2", "gsm2"],
    required: false,
  },
  {
    key: "wilaya",
    i18nKey: "customers.wilaya",
    aliases: ["wilaya", "state", "province", "region"],
    required: false,
  },
  {
    key: "commune",
    i18nKey: "customers.commune",
    aliases: ["commune", "city", "ville"],
    required: false,
  },
  {
    key: "address",
    i18nKey: "customers.address",
    aliases: ["adresse", "address", "rue", "street"],
    required: false,
  },
  {
    key: "notes",
    i18nKey: "customers.notes",
    aliases: ["note", "notes", "commentaire", "comment"],
    required: false,
  },
];

/** Convert a string to a number, stripping non-digit chars. */
export function parseNumber(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

/** Clean a phone number to 0XXXXXXXXX format. */
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("213")) digits = `0${digits.slice(3)}`;
  if (digits.startsWith("00")) digits = `0${digits.slice(2)}`;
  return digits;
}

export const ORDER_FIELDS: FieldConfig[] = [
  {
    key: "orderNumber",
    i18nKey: "orders.orderNumber",
    aliases: ["numero", "commande", "order", "order_number", "ref"],
    required: false,
  },
  {
    key: "customerName",
    i18nKey: "customers.name",
    aliases: ["client", "nom", "customer", "name"],
    required: true,
  },
  {
    key: "phone",
    i18nKey: "customers.phone",
    aliases: ["tel", "telephone", "phone", "mobile", "gsm"],
    required: true,
  },
  {
    key: "wilaya",
    i18nKey: "customers.wilaya",
    aliases: ["wilaya", "state", "province"],
    required: true,
  },
  {
    key: "commune",
    i18nKey: "customers.commune",
    aliases: ["commune", "city", "ville"],
    required: false,
  },
  {
    key: "address",
    i18nKey: "customers.address",
    aliases: ["adresse", "address", "rue"],
    required: false,
  },
  {
    key: "productSku",
    i18nKey: "products.sku",
    aliases: ["product_sku", "sku", "reference_produit", "product_ref"],
    required: false,
  },
  {
    key: "productName",
    i18nKey: "products.productName",
    aliases: ["produit", "product", "article", "designation"],
    required: false,
  },
  {
    key: "variantSku",
    i18nKey: "products.variantSku",
    aliases: ["variant_sku", "sku_variante", "option_sku"],
    required: false,
  },
  {
    key: "variantName",
    i18nKey: "products.variant",
    aliases: ["variant", "variante", "option", "taille", "size"],
    required: false,
  },
  {
    key: "quantity",
    i18nKey: "orders.quantity",
    aliases: ["quantite", "qty", "quantity", "qte"],
    required: true,
  },
  {
    key: "unitPrice",
    i18nKey: "orders.price",
    aliases: ["prix", "price", "montant", "amount"],
    required: false,
  },
  {
    key: "deliveryCost",
    i18nKey: "orders.deliveryCost",
    aliases: ["livraison", "shipping", "delivery_cost"],
    required: false,
  },
  {
    key: "status",
    i18nKey: "orders.status",
    aliases: ["statut", "status", "etat"],
    required: false,
  },
];

export const EXPENSE_FIELDS: FieldConfig[] = [
  {
    key: "date",
    i18nKey: "accounting.expenseDate",
    aliases: ["date", "jour"],
    required: true,
  },
  {
    key: "category",
    i18nKey: "accounting.expenseCategory",
    aliases: ["categorie", "category", "type"],
    required: true,
  },
  {
    key: "description",
    i18nKey: "accounting.expenseNotes",
    aliases: ["description", "notes", "libelle", "label"],
    required: false,
  },
  {
    key: "amount",
    i18nKey: "accounting.expenseAmount",
    aliases: ["montant", "amount", "prix", "total"],
    required: true,
  },
];

export const ECOMANAGER_CUSTOMER_MAPPING: Record<string, string> = {
  Nom: "name",
  Téléphone: "phone",
  "Téléphone 2": "phone2",
  Wilaya: "wilaya",
  Commune: "commune",
  Adresse: "address",
  Notes: "notes",
};

export const ECOMANAGER_ORDER_MAPPING: Record<string, string> = {
  "N° Commande": "orderNumber",
  Client: "customerName",
  Téléphone: "phone",
  Wilaya: "wilaya",
  Commune: "commune",
  Adresse: "address",
  Produit: "productName",
  Référence: "productSku",
  Variante: "variantName",
  "Référence variante": "variantSku",
  Quantité: "quantity",
  Prix: "unitPrice",
  Livraison: "deliveryCost",
  Statut: "status",
};

export const ECOMANAGER_PRODUCT_MAPPING: Record<string, string> = {
  Nom: "name",
  Référence: "sku",
  Prix: "price",
  Coût: "cost",
  Stock: "stock",
  Catégorie: "category",
};

export const SHOPIFY_ORDER_MAPPING: Record<string, string> = {
  Name: "orderNumber",
  "Customer Name": "customerName",
  Phone: "phone",
  "Shipping Province": "wilaya",
  "Shipping City": "commune",
  "Shipping Address1": "address",
  "Lineitem sku": "productSku",
  "Lineitem name": "productName",
  "Lineitem variant": "variantName",
  "Lineitem quantity": "quantity",
  "Lineitem price": "unitPrice",
  Status: "status",
};
