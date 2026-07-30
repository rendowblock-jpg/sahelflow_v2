import type { Locale } from "@/lib/i18n";

type ManualOrderErrorKind =
  | "stock"
  | "stale"
  | "idempotency"
  | "confirmationRequired"
  | "followupRequired"
  | "editRequired"
  | "validation"
  | "notFound"
  | "invalidTransition"
  | "conflict";

const COPY: Record<Locale, Record<ManualOrderErrorKind, string>> = {
  en: {
    stock: "The requested quantity is no longer available. Refresh the order and review stock.",
    stale: "This order changed in another view. Refresh it before confirming again.",
    idempotency: "This retry does not match the original request. Review the order and try again.",
    confirmationRequired: "Confirm or reject this order from the governed confirmation controls.",
    followupRequired: "Stock is already reserved for this order. Continue through the governed fulfillment flow.",
    editRequired: "Products and prices cannot be changed from this screen. Use a governed order-edit flow.",
    validation: "Review the order details and try again.",
    notFound: "The order or catalog item is no longer available. Refresh the page.",
    invalidTransition: "This action is no longer available for the order's current status.",
    conflict: "The order changed or the operation conflicts with current stock. Refresh and try again.",
  },
  fr: {
    stock: "La quantité demandée n’est plus disponible. Actualisez la commande et vérifiez le stock.",
    stale: "Cette commande a été modifiée dans une autre vue. Actualisez-la avant de confirmer à nouveau.",
    idempotency: "Cette nouvelle tentative ne correspond pas à la demande initiale. Vérifiez la commande puis réessayez.",
    confirmationRequired: "Confirmez ou refusez cette commande depuis les contrôles de confirmation gouvernés.",
    followupRequired: "Le stock est déjà réservé pour cette commande. Continuez via le flux d’expédition gouverné.",
    editRequired: "Les produits et les prix ne peuvent pas être modifiés depuis cet écran. Utilisez un flux de modification gouverné.",
    validation: "Vérifiez les informations de la commande puis réessayez.",
    notFound: "La commande ou l’article du catalogue n’est plus disponible. Actualisez la page.",
    invalidTransition: "Cette action n’est plus disponible pour l’état actuel de la commande.",
    conflict: "La commande a changé ou l’opération est en conflit avec le stock actuel. Actualisez puis réessayez.",
  },
  ar: {
    stock: "الكمية المطلوبة لم تعد متوفرة. حدّث الطلبية وراجع المخزون.",
    stale: "تم تعديل هذه الطلبية من شاشة أخرى. حدّثها قبل محاولة التأكيد مجددًا.",
    idempotency: "إعادة المحاولة لا تطابق الطلب الأصلي. راجع الطلبية ثم حاول مجددًا.",
    confirmationRequired: "أكّد هذه الطلبية أو ارفضها من أدوات التأكيد المعتمدة.",
    followupRequired: "تم حجز مخزون هذه الطلبية. أكمل العمل عبر مسار الشحن المعتمد.",
    editRequired: "لا يمكن تعديل المنتجات أو الأسعار من هذه الشاشة. استخدم مسار تعديل طلبية معتمدًا.",
    validation: "راجع بيانات الطلبية ثم حاول مجددًا.",
    notFound: "الطلبية أو منتج الكتالوج لم يعد متوفرًا. حدّث الصفحة.",
    invalidTransition: "هذه العملية لم تعد متاحة للحالة الحالية للطلبية.",
    conflict: "تغيّرت الطلبية أو تتعارض العملية مع المخزون الحالي. حدّث الصفحة وحاول مجددًا.",
  },
};

function classify(code: unknown, message: unknown): ManualOrderErrorKind | null {
  const normalizedCode = typeof code === "string" ? code : "";
  const normalizedMessage = typeof message === "string" ? message.toLowerCase() : "";

  if (normalizedCode === "CANONICAL_CONFIRMATION_REQUIRED") return "confirmationRequired";
  if (normalizedCode === "CANONICAL_FOLLOWUP_REQUIRED") return "followupRequired";
  if (normalizedCode === "CANONICAL_ORDER_EDIT_REQUIRED") return "editRequired";
  if (normalizedCode === "VALIDATION_ERROR") return "validation";
  if (normalizedCode === "NOT_FOUND") return "notFound";
  if (normalizedCode === "INVALID_TRANSITION") return "invalidTransition";

  if (normalizedCode === "CONFLICT") {
    if (normalizedMessage.includes("insufficient available stock")) return "stock";
    if (
      normalizedMessage.includes("version conflict") ||
      normalizedMessage.includes("changed while")
    ) {
      return "stale";
    }
    if (
      normalizedMessage.includes("different command content") ||
      normalizedMessage.includes("idempotency")
    ) {
      return "idempotency";
    }
    return "conflict";
  }

  return null;
}

export function translateManualOrderError(
  code: unknown,
  message: unknown,
  locale: Locale,
  fallback: string,
): string {
  const kind = classify(code, message);
  return kind ? COPY[locale][kind] : fallback;
}
