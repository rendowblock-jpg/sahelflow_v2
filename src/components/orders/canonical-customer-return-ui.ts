export type ReturnAction =
  | "request"
  | "approve"
  | "reject"
  | "cancel"
  | "mark_in_transit"
  | "receive"
  | "inspect"
  | "complete";

export type ReturnDisposition =
  | "available"
  | "damaged"
  | "quarantine"
  | "lost";

export interface CustomerReturnPosition {
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  status: string;
  returnState: string | null;
  refundState: string | null;
  codState: string | null;
  inventoryState: string | null;
  receivableAmount: number;
  effectiveRefundAmount: number;
  remainingOrderRefundableAmount: number;
  availableActions: ReturnAction[];
  orderItems: Array<{
    orderItemId: string;
    productId: string | null;
    productVariantId: string | null;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
  }>;
  returnCase: {
    id: string;
    caseType: "return" | "exchange";
    currentState: string;
    reasonCode: string;
    requestedAt: string;
    updatedAt: string;
    fullOrderReturn: boolean;
    itemValue: number;
    maximumWithDeliveryCost: number;
    effectiveRefundAmount: number;
    remainingItemRefundableAmount: number;
    replacementOrderId: string | null;
    replacementOrderNumber: string | null;
    requestedItems: Array<{
      orderItemId: string;
      productName: string;
      variantName: string | null;
      purchasedQuantity: number;
      requestedQuantity: number;
      unitPrice: number;
    }>;
    exchangeItems: Array<{
      productId: string;
      productVariantId: string | null;
      productName: string;
      productVariantName: string | null;
      quantity: number;
      unitPrice: number;
    }>;
    exchangeDeliveryCost: number;
    inspections: Array<{
      orderItemId: string;
      quantity: number;
      disposition: string;
      unitCost: number | null;
      lossAmount: number | null;
      reasonCode: string;
      occurredAt: string;
    }>;
  } | null;
  refunds: Array<{
    refundId: string;
    returnId: string | null;
    amount: number;
    reversedAmount: number;
    effectiveAmount: number;
    method: string;
    reasonCode: string;
    reference: string | null;
    occurredAt: string;
    canReverse: boolean;
  }>;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  productVariants: Array<{
    id: string;
    name: string;
    price: number | null;
    isActive: boolean;
  }>;
}

export interface ExchangeDraftLine {
  key: string;
  productId: string;
  productVariantId: string;
  quantity: string;
}

export const RETURN_COPY = {
  en: {
    heading: "Customer returns, exchanges and refunds",
    authority: "Every step is recorded in the order history.",
    loading: "Loading returns…",
    loadFailed: "Returns and refunds could not be loaded.",
    noAction: "Nothing to do on returns for this order right now.",
    state: "Return state",
    refundState: "Refund state",
    refunded: "Refunded",
    refundable: "Still refundable",
    requestedItems: "Requested items",
    replacement: "Replacement order",
    request: "Request return / exchange",
    approve: "Approve",
    reject: "Reject",
    cancel: "Cancel request",
    mark_in_transit: "Mark in transit",
    receive: "Receive return",
    inspect: "Inspect items",
    complete: "Complete case",
    refund: "Issue refund",
    reverse: "Reverse amount",
    caseType: "Case type",
    returnCase: "Return",
    exchangeCase: "Exchange",
    reason: "Reason code",
    reasonPlaceholder: "customer-changed-mind",
    quantity: "Return quantity",
    purchased: "Purchased",
    unitPrice: "Unit price",
    exchangeItems: "Replacement items",
    addReplacement: "Add replacement item",
    remove: "Remove",
    product: "Product",
    variant: "Variant",
    noVariant: "No variant",
    chooseProduct: "Choose product",
    chooseVariant: "Choose variant",
    exchangeDelivery: "Replacement delivery charge",
    disposition: "Where does it go?",
    chooseDisposition: "Choose",
    available: "Back to stock",
    damaged: "Damaged",
    quarantine: "Set aside for checking",
    lost: "Lost",
    method: "Refund method",
    cash: "Cash",
    bank: "Bank",
    credit: "Credit",
    courier_deduction: "Courier deduction",
    reference: "Reference",
    referencePlaceholder: "Bank or courier reference",
    includeDelivery: "Include original delivery charge",
    amount: "Amount",
    maximum: "Maximum",
    commit: "Confirm",
    committed: "Saved.",
    replayed: "This was already saved.",
    failed: "Nothing was saved. Refresh and try again.",
    conflict: "This order or return changed in the meantime. Refresh and try again.",
    invalid: "Choose a reason and fill in the quantities.",
    refunds: "Refunds",
    noRefunds: "No refund yet.",
    issued: "Issued",
    reversed: "Reversed",
    effective: "Counted",
    cancelDialog: "Cancel",
    openReplacement: "Open replacement",
    return: "Return",
    exchange: "Exchange",
  },
  fr: {
    heading: "Retours client, échanges et remboursements",
    authority: "Chaque étape est enregistrée dans l’historique de la commande.",
    loading: "Chargement des retours…",
    loadFailed: "Impossible de charger les retours et remboursements.",
    noAction: "Aucune action de retour possible pour cette commande pour le moment.",
    state: "État du retour",
    refundState: "État du remboursement",
    refunded: "Remboursé",
    refundable: "Encore remboursable",
    requestedItems: "Articles demandés",
    replacement: "Commande de remplacement",
    request: "Demander un retour / échange",
    approve: "Approuver",
    reject: "Rejeter",
    cancel: "Annuler la demande",
    mark_in_transit: "Marquer en transit",
    receive: "Recevoir le retour",
    inspect: "Inspecter les articles",
    complete: "Clôturer le dossier",
    refund: "Émettre un remboursement",
    reverse: "Annuler un montant",
    caseType: "Type de dossier",
    returnCase: "Retour",
    exchangeCase: "Échange",
    reason: "Code motif",
    reasonPlaceholder: "changement-avis-client",
    quantity: "Quantité retournée",
    purchased: "Achetée",
    unitPrice: "Prix unitaire",
    exchangeItems: "Articles de remplacement",
    addReplacement: "Ajouter un article",
    remove: "Retirer",
    product: "Produit",
    variant: "Variante",
    noVariant: "Sans variante",
    chooseProduct: "Choisir le produit",
    chooseVariant: "Choisir la variante",
    exchangeDelivery: "Frais de livraison du remplacement",
    disposition: "Où va l’article ?",
    chooseDisposition: "Choisir",
    available: "Remis en stock",
    damaged: "Endommagé",
    quarantine: "Mis de côté pour vérification",
    lost: "Perdu",
    method: "Méthode de remboursement",
    cash: "Espèces",
    bank: "Banque",
    credit: "Crédit",
    courier_deduction: "Déduction transporteur",
    reference: "Référence",
    referencePlaceholder: "Référence banque ou transporteur",
    includeDelivery: "Inclure les frais de livraison initiaux",
    amount: "Montant",
    maximum: "Maximum",
    commit: "Confirmer",
    committed: "Enregistré.",
    replayed: "C’était déjà enregistré.",
    failed: "Rien n’a été enregistré. Actualisez puis réessayez.",
    conflict: "Cette commande ou ce retour a changé entre-temps. Actualisez puis réessayez.",
    invalid: "Choisissez un motif et renseignez les quantités.",
    refunds: "Remboursements",
    noRefunds: "Aucun remboursement pour l’instant.",
    issued: "Émis",
    reversed: "Annulé",
    effective: "Pris en compte",
    cancelDialog: "Annuler",
    openReplacement: "Ouvrir le remplacement",
    return: "Retour",
    exchange: "Échange",
  },
  ar: {
    heading: "إرجاع الزبون والاستبدال والاسترداد",
    authority: "تُسجَّل كل خطوة في سجل الطلبية.",
    loading: "جارٍ تحميل المرتجعات…",
    loadFailed: "تعذّر تحميل المرتجعات والاستردادات.",
    noAction: "لا يوجد إجراء إرجاع متاح لهذه الطلبية حاليًا.",
    state: "حالة الإرجاع",
    refundState: "حالة الاسترداد",
    refunded: "المسترد",
    refundable: "المتبقي القابل للاسترداد",
    requestedItems: "العناصر المطلوبة",
    replacement: "طلبية الاستبدال",
    request: "طلب إرجاع / استبدال",
    approve: "موافقة",
    reject: "رفض",
    cancel: "إلغاء الطلب",
    mark_in_transit: "تعليمها قيد النقل",
    receive: "استلام الإرجاع",
    inspect: "فحص العناصر",
    complete: "إتمام الملف",
    refund: "إصدار استرداد",
    reverse: "عكس مبلغ",
    caseType: "نوع الملف",
    returnCase: "إرجاع",
    exchangeCase: "استبدال",
    reason: "رمز السبب",
    reasonPlaceholder: "غيّر-الزبون-رأيه",
    quantity: "كمية الإرجاع",
    purchased: "المشتراة",
    unitPrice: "سعر الوحدة",
    exchangeItems: "منتجات الاستبدال",
    addReplacement: "إضافة عنصر استبدال",
    remove: "حذف",
    product: "المنتج",
    variant: "الخيار",
    noVariant: "دون خيار",
    chooseProduct: "اختر المنتج",
    chooseVariant: "اختر الخيار",
    exchangeDelivery: "تكلفة توصيل الاستبدال",
    disposition: "أين يذهب المنتج؟",
    chooseDisposition: "اختر",
    available: "يعود إلى المخزون",
    damaged: "تالف",
    quarantine: "معزول للفحص",
    lost: "مفقود",
    method: "طريقة الاسترداد",
    cash: "نقدًا",
    bank: "بنك",
    credit: "رصيد",
    courier_deduction: "خصم من شركة التوصيل",
    reference: "المرجع",
    referencePlaceholder: "مرجع البنك أو شركة التوصيل",
    includeDelivery: "إضافة تكلفة التوصيل الأصلية",
    amount: "المبلغ",
    maximum: "الحد الأقصى",
    commit: "تأكيد",
    committed: "تم الحفظ.",
    replayed: "سبق حفظ ذلك.",
    failed: "لم يُحفظ شيء. حدّث الصفحة ثم أعد المحاولة.",
    conflict: "تغيّرت هذه الطلبية أو هذا الإرجاع في الأثناء. حدّث الصفحة ثم أعد المحاولة.",
    invalid: "اختر سببًا وأدخل الكميات.",
    refunds: "الاستردادات",
    noRefunds: "لا يوجد استرداد بعد.",
    issued: "صادر",
    reversed: "معكوس",
    effective: "المحتسب",
    cancelDialog: "إلغاء",
    openReplacement: "فتح طلبية الاستبدال",
    return: "إرجاع",
    exchange: "استبدال",
  },
} as const;
