export type SupportedLocale = "ar" | "fr" | "en";

export const COPY: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Protected backup and recovery",
    description:
      "Create one verified encrypted snapshot of every registered shop and keep an independent recovery kit for replacement-install recovery.",
    desktopOnly: "Protected backup and restore are available in the SahelFlow desktop app.",
    create: "Create all-shop backup",
    creating: "Creating verified backup…",
    createKit: "Create recovery kit",
    creatingKit: "Creating recovery kit…",
    empty: "No protected backups yet",
    emptyDescription: "Create the first encrypted all-shop backup before relying on this device.",
    backup: "Backup",
    shops: "Shops",
    size: "Encrypted size",
    verified: "Verified",
    recovery: "Recovery",
    actions: "Actions",
    ready: "Independent kit ready",
    kitRequired: "Recovery kit required",
    localAuthority: "Local recovery authority",
    corrupt: "Corrupt — restore blocked",
    restore: "Restore",
    delete: "Delete",
    restoreTitle: "Prepare replacement-safe restore",
    restoreDescription:
      "SahelFlow verifies the complete encrypted set, stages every shop, creates a rescue generation, then relaunches before cutover.",
    recoveryCode: "Recovery code",
    recoveryCodeHint: "Enter the code shown when the independent recovery kit was created.",
    cancel: "Cancel",
    preparingRestore: "Verifying and staging…",
    confirmRestore: "Verify, stage and relaunch",
    deleteTitle: "Delete protected backup?",
    deleteDescription:
      "The encrypted container will be removed and a non-PII deletion receipt will be retained.",
    kitTitle: "Save this recovery code now",
    kitDescription:
      "The kit and this code are independent. SahelFlow cannot reconstruct the code later.",
    kitPath: "Recovery-kit location",
    codeLabel: "One-time recovery code",
    saved: "I saved the kit and code",
    createSuccess: "Verified all-shop backup created.",
    kitSuccess: "Independent recovery kit created.",
    deleteSuccess: "Protected backup deleted.",
    restoreSuccess: "Restore staged. SahelFlow is relaunching into protected cutover.",
    loadFailed: "Protected backups could not be loaded.",
    actionFailed: "The protected operation failed safely.",
  },
  fr: {
    title: "Sauvegarde et récupération protégées",
    description:
      "Créez un instantané chiffré et vérifié de toutes les boutiques, avec un kit indépendant pour une réinstallation de remplacement.",
    desktopOnly: "La sauvegarde et la restauration protégées sont disponibles dans l’application SahelFlow pour bureau.",
    create: "Sauvegarder toutes les boutiques",
    creating: "Création et vérification…",
    createKit: "Créer le kit de récupération",
    creatingKit: "Création du kit…",
    empty: "Aucune sauvegarde protégée",
    emptyDescription: "Créez une sauvegarde chiffrée complète avant de dépendre de cet appareil.",
    backup: "Sauvegarde",
    shops: "Boutiques",
    size: "Taille chiffrée",
    verified: "Vérification",
    recovery: "Récupération",
    actions: "Actions",
    ready: "Kit indépendant prêt",
    kitRequired: "Kit de récupération requis",
    localAuthority: "Autorité locale disponible",
    corrupt: "Corrompue — restauration bloquée",
    restore: "Restaurer",
    delete: "Supprimer",
    restoreTitle: "Préparer une restauration sûre",
    restoreDescription:
      "SahelFlow vérifie l’ensemble complet, prépare chaque boutique, crée une génération de secours puis redémarre avant le remplacement.",
    recoveryCode: "Code de récupération",
    recoveryCodeHint: "Saisissez le code affiché lors de la création du kit indépendant.",
    cancel: "Annuler",
    preparingRestore: "Vérification et préparation…",
    confirmRestore: "Vérifier, préparer et redémarrer",
    deleteTitle: "Supprimer la sauvegarde protégée ?",
    deleteDescription:
      "Le conteneur chiffré sera supprimé et un reçu non personnel sera conservé.",
    kitTitle: "Enregistrez ce code maintenant",
    kitDescription:
      "Le kit et ce code sont indépendants. SahelFlow ne pourra pas reconstruire le code plus tard.",
    kitPath: "Emplacement du kit",
    codeLabel: "Code de récupération à usage unique",
    saved: "J’ai enregistré le kit et le code",
    createSuccess: "Sauvegarde vérifiée de toutes les boutiques créée.",
    kitSuccess: "Kit de récupération indépendant créé.",
    deleteSuccess: "Sauvegarde protégée supprimée.",
    restoreSuccess: "Restauration préparée. SahelFlow redémarre pour appliquer le remplacement protégé.",
    loadFailed: "Impossible de charger les sauvegardes protégées.",
    actionFailed: "L’opération protégée a échoué sans modifier les données.",
  },
  ar: {
    title: "النسخ الاحتياطي والاسترجاع المحمي",
    description:
      "أنشئ نسخة مشفرة ومتحققًا منها لكل المتاجر، مع حزمة استرجاع مستقلة لاستخدامها عند تثبيت بديل.",
    desktopOnly: "النسخ والاسترجاع المحميان متاحان داخل تطبيق SahelFlow لسطح المكتب.",
    create: "إنشاء نسخة لكل المتاجر",
    creating: "جارٍ الإنشاء والتحقق…",
    createKit: "إنشاء حزمة الاسترجاع",
    creatingKit: "جارٍ إنشاء الحزمة…",
    empty: "لا توجد نسخ محمية بعد",
    emptyDescription: "أنشئ أول نسخة مشفرة لجميع المتاجر قبل الاعتماد على هذا الجهاز.",
    backup: "النسخة",
    shops: "المتاجر",
    size: "الحجم المشفر",
    verified: "التحقق",
    recovery: "الاسترجاع",
    actions: "الإجراءات",
    ready: "الحزمة المستقلة جاهزة",
    kitRequired: "حزمة الاسترجاع مطلوبة",
    localAuthority: "صلاحية الاسترجاع المحلية متوفرة",
    corrupt: "تالفة — الاسترجاع محظور",
    restore: "استرجاع",
    delete: "حذف",
    restoreTitle: "تحضير استرجاع آمن للتثبيت البديل",
    restoreDescription:
      "يتحقق SahelFlow من المجموعة كاملة، ويجهز كل المتاجر، وينشئ نسخة إنقاذ، ثم يعيد التشغيل قبل الاستبدال.",
    recoveryCode: "رمز الاسترجاع",
    recoveryCodeHint: "أدخل الرمز الذي ظهر عند إنشاء حزمة الاسترجاع المستقلة.",
    cancel: "إلغاء",
    preparingRestore: "جارٍ التحقق والتحضير…",
    confirmRestore: "التحقق والتحضير وإعادة التشغيل",
    deleteTitle: "حذف النسخة المحمية؟",
    deleteDescription: "ستُحذف الحاوية المشفرة مع الاحتفاظ بوصل حذف خالٍ من البيانات الشخصية.",
    kitTitle: "احفظ رمز الاسترجاع الآن",
    kitDescription:
      "الحزمة والرمز مستقلان. لا يستطيع SahelFlow إعادة إنشاء الرمز لاحقًا.",
    kitPath: "مكان حزمة الاسترجاع",
    codeLabel: "رمز الاسترجاع لمرة واحدة",
    saved: "حفظت الحزمة والرمز",
    createSuccess: "تم إنشاء نسخة محمية ومتحقق منها لكل المتاجر.",
    kitSuccess: "تم إنشاء حزمة الاسترجاع المستقلة.",
    deleteSuccess: "تم حذف النسخة المحمية.",
    restoreSuccess: "تم تحضير الاسترجاع. سيُعاد تشغيل SahelFlow لإتمام الاستبدال المحمي.",
    loadFailed: "تعذر تحميل النسخ المحمية.",
    actionFailed: "فشل الإجراء المحمي بأمان دون تطبيق بيانات غير متحقق منها.",
  },
};

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
