export const apiErrors = {
  en: {
    storeNotFound: "Store not found",
    productsNotFound: "Products not found or unauthorized",
    failedToCreateOrder: "Failed to create order",
    unknownProvider: "Unknown provider",
    orderNotFound: "Order not found",
  },
  fr: {
    storeNotFound: "Boutique introuvable",
    productsNotFound: "Produits introuvables ou non autorisés",
    failedToCreateOrder: "Échec de la création de la commande",
    unknownProvider: "Fournisseur inconnu",
    orderNotFound: "Commande introuvable",
  },
  ar: {
    storeNotFound: "المتجر غير موجود",
    productsNotFound: "المنتجات غير موجودة أو غير مصرح بها",
    failedToCreateOrder: "فشل إنشاء الطلب",
    unknownProvider: "مزود غير معروف",
    orderNotFound: "الطلب غير موجود",
  },
} as const;

export type ApiErrorKey = keyof typeof apiErrors.en;
