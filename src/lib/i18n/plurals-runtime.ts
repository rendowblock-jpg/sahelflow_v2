import type { Locale } from "@/lib/i18n";

/**
 * Runtime plural-agreement dictionary (R5-a — audit d6 #5).
 *
 * Arabic has six Intl.PluralRules categories (zero/one/two/few/many/other) and
 * the static locale JSON bundle carries plural-suffixed keys for exactly one
 * high-visibility count key (orders.count). Every other UI-visible count —
 * queue badges, table selections, inbox unread, dashboard stats, stock and
 * import counts — fell back to a single "{{count}} noun" string that is
 * grammatically wrong in Arabic for 0/1/2/3–10/11–99.
 *
 * This dictionary supplies `${key}_${pluralRule}` forms that the shared
 * resolver in use-i18n.ts / i18n-server.ts picks up automatically:
 *
 *   value = translations[key] ?? getRuntimeTranslation(locale, key) ?? key
 *   pluralKey = `${key}_${Intl.PluralRules(locale).select(count)}`
 *   value = translations[pluralKey] ?? getRuntimeTranslation(locale, pluralKey) ?? value
 *
 * Precedence notes (verified against both resolvers):
 *   - A plural-suffixed key in the locale JSON still WINS over this dictionary
 *     (ar.json keeps owning notif.staleQueue.title_one/_other and the full
 *     orders.count set). This dictionary fills only the categories the JSON
 *     bundle does not define.
 *   - Base (unsuffixed) values stay where they live today (locale JSON or the
 *     owning runtime dict) — only plural-suffixed variants ship here, so the
 *     runtime chain stays additive.
 *
 * en/fr follow CLDR: en exposes one/other; fr exposes one/other/many. Entries
 * are provided per locale only where the base copy is wrong for a number class
 * (e.g. "1 selected", "1 commandes", "1 orders") or where a call site was
 * migrated from an {{n}} param to {count} and the base would otherwise leak a
 * raw placeholder for an uncovered category.
 *
 * Arabic copy follows the existing Maghrebi commerce register in ar.json
 * (الطلبية/الطلبيات for orders, الزبون/الزبائن for customers).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Confirmation queue — bulk reject dialog title.
    "confirmationQueue.bulk.rejectTitle_one": "Reject {{count}} order",
    "confirmationQueue.bulk.rejectTitle_other": "Reject {{count}} orders",
    // Orders workspace — bulk status toast (base uses {{n}}; migrated to count).
    "orders.bulkSuccess_one": "{{count}} order updated successfully",
    "orders.bulkSuccess_other": "{{count}} orders updated successfully",
    // Topbar unread badge (base uses {{n}}; migrated to count).
    "topbar.newNotifications_one": "{{count}} new",
    "topbar.newNotifications_other": "{{count}} new",
    // Data table pagination footer ("1 items" in the base is wrong).
    "dataTable.pageOf_one": "Page {{current}} of {{total}} ({{count}} item)",
    "dataTable.pageOf_other": "Page {{current}} of {{total}} ({{count}} items)",
    // Dashboard stat card subtitle ("1 pending deliveries" in the base is wrong).
    "dashboard.pendingDeliveries_one": "{{count}} pending delivery",
    "dashboard.pendingDeliveries_other": "{{count}} pending deliveries",
    // Inbox label filter count ("1 labels" in the base is wrong).
    "inbox.labels.count_one": "{{count}} label",
    "inbox.labels.count_other": "{{count}} labels",
    // Storefronts list — product count per storefront ("product(s)" cleanup).
    "storefront.list.productsCount_one": "{{count}} product",
    "storefront.list.productsCount_other": "{{count}} products",
    // Import panel.
    "import.importRows_one": "Import {{count}} row",
    "import.importRows_other": "Import {{count}} rows",
    "import.success_one": "{{count}} item imported successfully",
    "import.success_other": "{{count}} items imported successfully",
    "import.errorCount_one": "{{count}} error:",
    "import.errorCount_other": "{{count}} errors:",
    "import.invalidLines_one": "Invalid line ({{count}}):",
    "import.invalidLines_other": "Invalid lines ({{count}}):",
  },
  fr: {
    // File d'attente de confirmation.
    "confirmationQueue.bulk.rejectTitle_one": "Refuser {{count}} commande",
    "confirmationQueue.bulk.rejectTitle_other": "Refuser {{count}} commandes",
    // Commandes — toast de mise à jour groupée (base en {{n}} ; migrée vers count).
    "orders.bulkSuccess_one": "{{count}} commande mise à jour",
    "orders.bulkSuccess_other": "{{count}} commandes mises à jour",
    "orders.bulkSuccess_many": "{{count}} commandes mises à jour",
    // Badge de notifications non lues (base en {{n}} ; migrée vers count).
    "topbar.newNotifications_one": "{{count}} nouvelle",
    "topbar.newNotifications_other": "{{count}} nouvelles",
    "topbar.newNotifications_many": "{{count}} nouvelles",
    // Sélection et pagination des tableaux.
    "dataTable.selected_one": "{{count}} sélectionné",
    "dataTable.selected_other": "{{count}} sélectionnés",
    "dataTable.pageOf_one": "Page {{current}} sur {{total}} ({{count}} élément)",
    "dataTable.pageOf_other": "Page {{current}} sur {{total}} ({{count}} éléments)",
    // Statistiques du tableau de bord.
    "dashboard.pendingDeliveries_one": "{{count}} livraison en attente",
    "dashboard.pendingDeliveries_other": "{{count}} livraisons en attente",
    // Boîte de réception.
    "inbox.liveness.unreadMessages_one": "{{count}} message non lu",
    "inbox.liveness.unreadMessages_other": "{{count}} messages non lus",
    "inbox.liveness.unreadMessages_many": "{{count}} messages non lus",
    "inbox.labels.count_one": "{{count}} étiquette",
    "inbox.labels.count_other": "{{count}} étiquettes",
    // Vitrines.
    "storefront.list.productsCount_one": "{{count}} produit",
    "storefront.list.productsCount_other": "{{count}} produits",
    "storefront.builder.selectedCount_one": "{{count}} sélectionné",
    "storefront.builder.selectedCount_other": "{{count}} sélectionnés",
    // Produits.
    "products.lowStockCount_one": "{{count}} restant",
    "products.lowStockCount_other": "{{count}} restants",
    // Import.
    "import.importRows_one": "Importer {{count}} ligne",
    "import.importRows_other": "Importer {{count}} lignes",
    "import.success_one": "{{count}} élément importé avec succès",
    "import.success_other": "{{count}} éléments importés avec succès",
    "import.errorCount_one": "{{count}} erreur:",
    "import.errorCount_other": "{{count}} erreurs:",
    "import.invalidLines_one": "Ligne invalide ({{count}}):",
    "import.invalidLines_other": "Lignes invalides ({{count}}):",
  },
  ar: {
    // قائمة انتظار التأكيد — شارة العدد + عنوان الرفض الجماعي.
    "confirmationQueue.header.pendingCount_zero": "لا طلبيات قيد الانتظار",
    "confirmationQueue.header.pendingCount_one": "طلبية واحدة قيد الانتظار",
    "confirmationQueue.header.pendingCount_two": "طلبيتان قيد الانتظار",
    "confirmationQueue.header.pendingCount_few": "{{count}} طلبيات قيد الانتظار",
    "confirmationQueue.header.pendingCount_many": "{{count}} طلبية قيد الانتظار",
    "confirmationQueue.header.pendingCount_other": "{{count}} طلبية قيد الانتظار",
    "confirmationQueue.bulk.rejectTitle_zero": "لا طلبيات محددة",
    "confirmationQueue.bulk.rejectTitle_one": "رفض طلبية واحدة",
    "confirmationQueue.bulk.rejectTitle_two": "رفض طلبيتين",
    "confirmationQueue.bulk.rejectTitle_few": "رفض {{count}} طلبيات",
    "confirmationQueue.bulk.rejectTitle_many": "رفض {{count}} طلبية",
    "confirmationQueue.bulk.rejectTitle_other": "رفض {{count}} طلبية",
    // الطلبيات — رسالة التحديث الجماعي (القاعدة تستعمل {{n}}؛ حُوّلت إلى count).
    "orders.bulkSuccess_zero": "لم تُحدَّث أي طلبية",
    "orders.bulkSuccess_one": "تم تحديث طلبية واحدة بنجاح",
    "orders.bulkSuccess_two": "تم تحديث طلبيتين بنجاح",
    "orders.bulkSuccess_few": "تم تحديث {{count}} طلبيات بنجاح",
    "orders.bulkSuccess_many": "تم تحديث {{count}} طلبية بنجاح",
    "orders.bulkSuccess_other": "تم تحديث {{count}} طلبية بنجاح",
    // شريط الإشعارات في الشريط العلوي (القاعدة تستعمل {{n}}؛ حُوّلت إلى count).
    "topbar.newNotifications_zero": "لا إشعارات جديدة",
    "topbar.newNotifications_one": "إشعار جديد واحد",
    "topbar.newNotifications_two": "إشعاران جديدان",
    "topbar.newNotifications_few": "{{count}} إشعارات جديدة",
    "topbar.newNotifications_many": "{{count}} إشعارًا جديدًا",
    "topbar.newNotifications_other": "{{count}} إشعار جديد",
    // جداول البيانات — شريط التحديد وتذييل الصفحات.
    "dataTable.selected_zero": "لا عناصر محددة",
    "dataTable.selected_one": "عنصر واحد محدد",
    "dataTable.selected_two": "عنصران محددان",
    "dataTable.selected_few": "{{count}} عناصر محددة",
    "dataTable.selected_many": "{{count}} عنصرًا محددًا",
    "dataTable.selected_other": "{{count}} عنصر محدد",
    "dataTable.pageOf_zero": "صفحة {{current}} من {{total}} (لا عناصر)",
    "dataTable.pageOf_one": "صفحة {{current}} من {{total}} (عنصر واحد)",
    "dataTable.pageOf_two": "صفحة {{current}} من {{total}} (عنصران)",
    "dataTable.pageOf_few": "صفحة {{current}} من {{total}} ({{count}} عناصر)",
    "dataTable.pageOf_many": "صفحة {{current}} من {{total}} ({{count}} عنصرًا)",
    "dataTable.pageOf_other": "صفحة {{current}} من {{total}} ({{count}} عنصر)",
    // لوحة القيادة — التوصيلات المعلقة.
    "dashboard.pendingDeliveries_zero": "لا توصيلات في الانتظار",
    "dashboard.pendingDeliveries_one": "توصيلة واحدة في الانتظار",
    "dashboard.pendingDeliveries_two": "توصيلتان في الانتظار",
    "dashboard.pendingDeliveries_few": "{{count}} توصيلات في الانتظار",
    "dashboard.pendingDeliveries_many": "{{count}} توصيلًا في الانتظار",
    "dashboard.pendingDeliveries_other": "{{count}} توصيل في الانتظار",
    // صندوق الوارد — شارة الرسائل غير المقروءة وعدد التصنيفات.
    "inbox.liveness.unreadMessages_zero": "لا رسائل غير مقروءة",
    "inbox.liveness.unreadMessages_one": "رسالة واحدة غير مقروءة",
    "inbox.liveness.unreadMessages_two": "رسالتان غير مقروءتان",
    "inbox.liveness.unreadMessages_few": "{{count}} رسائل غير مقروءة",
    "inbox.liveness.unreadMessages_many": "{{count}} رسالة غير مقروءة",
    "inbox.liveness.unreadMessages_other": "{{count}} رسالة غير مقروءة",
    "inbox.labels.count_zero": "لا تصنيفات",
    "inbox.labels.count_one": "تصنيف واحد",
    "inbox.labels.count_two": "تصنيفان",
    "inbox.labels.count_few": "{{count}} تصنيفات",
    "inbox.labels.count_many": "{{count}} تصنيفًا",
    "inbox.labels.count_other": "{{count}} تصنيف",
    // الإشعارات — تُكمل فئات ar.json: ‎_one و_other مملوكان لملف اللغة (يفوز JSON).
    "notif.staleQueue.title_zero": "لا طلبات تحتاج إلى تأكيد",
    "notif.staleQueue.title_two": "طلبان يحتاجان إلى تأكيد",
    "notif.staleQueue.title_few": "{{count}} طلبات تحتاج إلى تأكيد",
    "notif.staleQueue.title_many": "{{count}} طلبًا يحتاج إلى تأكيد",
    // واجهة المتجر — سلة المشتري وعدد المنتجات والمخزون والتحديد.
    "storefront.view.cart_zero": "سلة التسوق (فارغة)",
    "storefront.view.cart_one": "سلة التسوق (عنصر واحد)",
    "storefront.view.cart_two": "سلة التسوق (عنصران)",
    "storefront.view.cart_few": "سلة التسوق ({{count}} عناصر)",
    "storefront.view.cart_many": "سلة التسوق ({{count}} عنصرًا)",
    "storefront.view.cart_other": "سلة التسوق ({{count}} عنصر)",
    "storefront.studio.stockCount_zero": "نفد المخزون",
    "storefront.studio.stockCount_one": "المخزون: قطعة واحدة",
    "storefront.studio.stockCount_two": "المخزون: قطعتان",
    "storefront.studio.stockCount_few": "المخزون: {{count}} قطع",
    "storefront.studio.stockCount_many": "المخزون: {{count}} قطعة",
    "storefront.studio.stockCount_other": "المخزون: {{count}} قطعة",
    "storefront.list.productsCount_zero": "لا منتجات",
    "storefront.list.productsCount_one": "منتج واحد",
    "storefront.list.productsCount_two": "منتجان",
    "storefront.list.productsCount_few": "{{count}} منتجات",
    "storefront.list.productsCount_many": "{{count}} منتجًا",
    "storefront.list.productsCount_other": "{{count}} منتج",
    "storefront.builder.selectedCount_zero": "لم يتم اختيار أي عنصر",
    "storefront.builder.selectedCount_one": "تم اختيار عنصر واحد",
    "storefront.builder.selectedCount_two": "تم اختيار عنصرين",
    "storefront.builder.selectedCount_few": "تم اختيار {{count}} عناصر",
    "storefront.builder.selectedCount_many": "تم اختيار {{count}} عنصرًا",
    "storefront.builder.selectedCount_other": "تم اختيار {{count}} عنصر",
    // المنتجات — عدّاد المخزون في منتقي الخيارات (يساوي سجل order-form-runtime).
    "products.inStockCount_zero": "لا مخزون",
    "products.inStockCount_one": "واحد في المخزون",
    "products.inStockCount_two": "اثنان في المخزون",
    "products.inStockCount_few": "{{count}} في المخزون",
    "products.inStockCount_many": "{{count}} في المخزون",
    "products.inStockCount_other": "{{count}} في المخزون",
    "products.lowStockCount_zero": "نفد المخزون",
    "products.lowStockCount_one": "متبقٍ قطعة واحدة",
    "products.lowStockCount_two": "متبقٍ قطعتان",
    "products.lowStockCount_few": "متبقٍ {{count}} قطع",
    "products.lowStockCount_many": "متبقٍ {{count}} قطعة",
    "products.lowStockCount_other": "متبقٍ {{count}} قطعة",
    // الاستيراد — زر التأكيد والنتائج والأخطاء والصفوف غير الصالحة.
    "import.importRows_zero": "لا صفوف للاستيراد",
    "import.importRows_one": "استيراد صف واحد",
    "import.importRows_two": "استيراد صفّين",
    "import.importRows_few": "استيراد {{count}} صفوف",
    "import.importRows_many": "استيراد {{count}} صفًا",
    "import.importRows_other": "استيراد {{count}} صف",
    "import.success_zero": "لم يتم استيراد أي عنصر",
    "import.success_one": "تم استيراد عنصر واحد بنجاح",
    "import.success_two": "تم استيراد عنصرين بنجاح",
    "import.success_few": "تم استيراد {{count}} عناصر بنجاح",
    "import.success_many": "تم استيراد {{count}} عنصرًا بنجاح",
    "import.success_other": "تم استيراد {{count}} عنصر بنجاح",
    "import.errorCount_zero": "لا أخطاء",
    "import.errorCount_one": "خطأ واحد:",
    "import.errorCount_two": "خطآن:",
    "import.errorCount_few": "{{count}} أخطاء:",
    "import.errorCount_many": "{{count}} خطأً:",
    "import.errorCount_other": "{{count}} خطأ:",
    "import.invalidLines_zero": "لا صفوف غير صالحة",
    "import.invalidLines_one": "صف واحد غير صالح:",
    "import.invalidLines_two": "صفّان غير صالحان:",
    "import.invalidLines_few": "صفوف غير صالحة ({{count}}):",
    "import.invalidLines_many": "صفوف غير صالحة ({{count}}):",
    "import.invalidLines_other": "صفوف غير صالحة ({{count}}):",
  },
};

export function getPluralsRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
