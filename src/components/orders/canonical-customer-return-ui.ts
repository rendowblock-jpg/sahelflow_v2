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
    authority: "Governed return and money authority",
    loading: "Loading return authority…",
    loadFailed: "The return and refund position could not be loaded.",
    noAction: "No customer-return action is currently available.",
    state: "Return state",
    refundState: "Refund state",
    refunded: "Effective refunds",
    refundable: "Remaining refundable",
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
    exchangeItems: "Replacement catalog items",
    addReplacement: "Add replacement item",
    remove: "Remove",
    product: "Product",
    variant: "Variant",
    noVariant: "No variant",
    chooseProduct: "Choose product",
    chooseVariant: "Choose variant",
    exchangeDelivery: "Replacement delivery charge",
    disposition: "Disposition",
    chooseDisposition: "Choose disposition",
    available: "Available",
    damaged: "Damaged",
    quarantine: "Quarantine",
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
    commit: "Commit governed action",
    committed: "The governed action was committed.",
    replayed: "The previously committed action was recovered safely.",
    failed: "The action was not committed. Refresh and retry.",
    conflict: "The order or return case changed. Refresh before retrying.",
    invalid: "Complete the required quantities, reason and evidence.",
    refunds: "Refund ledger",
    noRefunds: "No canonical refund has been issued.",
    issued: "Issued",
    reversed: "Reversed",
    effective: "Effective",
    cancelDialog: "Cancel",
    openReplacement: "Open replacement",
    return: "Return",
    exchange: "Exchange",
  },
  fr: {
    heading: "Retours client, échanges et remboursements",
    authority: "Autorité gouvernée des retours et de l'argent",
    loading: "Chargement de l'autorité de retour…",
    loadFailed: "La position de retour et remboursement n'a pas pu être chargée.",
    noAction: "Aucune action de retour client n'est disponible.",
    state: "État du retour",
    refundState: "État du remboursement",
    refunded: "Remboursements effectifs",
    refundable: "Remboursable restant",
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
    exchangeItems: "Articles de remplacement du catalogue",
    addReplacement: "Ajouter un article",
    remove: "Retirer",
    product: "Produit",
    variant: "Variante",
    noVariant: "Sans variante",
    chooseProduct: "Choisir le produit",
    chooseVariant: "Choisir la variante",
    exchangeDelivery: "Frais de livraison du remplacement",
    disposition: "Disposition",
    chooseDisposition: "Choisir la disposition",
    available: "Disponible",
    damaged: "Endommagé",
    quarantine: "Quarantaine",
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
    commit: "Valider l'action gouvernée",
    committed: "L'action gouvernée a été validée.",
    replayed: "L'action déjà validée a été récupérée sans risque.",
    failed: "L'action n'a pas été validée. Actualisez puis réessayez.",
    conflict: "La commande ou le dossier a changé. Actualisez avant de réessayer.",
    invalid: "Complétez les quantités, le motif et les preuves requises.",
    refunds: "Registre des remboursements",
    noRefunds: "Aucun remboursement canonique n'a été émis.",
    issued: "Émis",
    reversed: "Annulé",
    effective: "Effectif",
    cancelDialog: "Annuler",
    openReplacement: "Ouvrir le remplacement",
    return: "Retour",
    exchange: "Échange",
  },
  ar: {
    heading: "إرجاع الزبون والاستبدال والاسترداد",
    authority: "صلاحية موثوقة للإرجاع والمال",
    loading: "جارٍ تحميل صلاحية الإرجاع…",
    loadFailed: "تعذر تحميل حالة الإرجاع والاسترداد.",
    noAction: "لا يوجد إجراء إرجاع متاح حاليًا.",
    state: "حالة الإرجاع",
    refundState: "حالة الاسترداد",
    refunded: "الاسترداد الفعلي",
    refundable: "المبلغ المتبقي للاسترداد",
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
    exchangeItems: "عناصر الاستبدال من الكتالوج",
    addReplacement: "إضافة عنصر استبدال",
    remove: "حذف",
    product: "المنتج",
    variant: "الخيار",
    noVariant: "دون خيار",
    chooseProduct: "اختر المنتج",
    chooseVariant: "اختر الخيار",
    exchangeDelivery: "تكلفة توصيل الاستبدال",
    disposition: "التصنيف",
    chooseDisposition: "اختر التصنيف",
    available: "متاح",
    damaged: "تالف",
    quarantine: "محجور",
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
    commit: "اعتماد الإجراء الموثوق",
    committed: "تم اعتماد الإجراء الموثوق.",
    replayed: "تمت استعادة الإجراء المعتمد سابقًا بأمان.",
    failed: "لم يتم اعتماد الإجراء. حدّث الصفحة ثم أعد المحاولة.",
    conflict: "تغيّرت الطلبية أو ملف الإرجاع. حدّث قبل إعادة المحاولة.",
    invalid: "أكمل الكميات والسبب والإثباتات المطلوبة.",
    refunds: "سجل الاسترداد",
    noRefunds: "لم يتم إصدار استرداد موثوق بعد.",
    issued: "صادر",
    reversed: "معكوس",
    effective: "فعلي",
    cancelDialog: "إلغاء",
    openReplacement: "فتح طلبية الاستبدال",
    return: "إرجاع",
    exchange: "استبدال",
  },
} as const;
