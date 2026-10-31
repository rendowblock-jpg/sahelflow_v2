import type { Catalog } from "./types";

// W3b F6b: شاشة الإعدادات والأجهزة. الرمز السري يقفل الشاشة فقط: لا نص يقول إنه يشفّر. Arabic is a DRAFT until the Founder's native read.
export const settingsAr: Catalog = {
  "settings.lastSync": "آخر تحديث {{time}}",
  "settings.lastSync.none": "لا يوجد تحديث بعد",
  "settings.pairedSince": "مقترن منذ {{date}}",
  "settings.pinNote": "الرمز السري يقفل الشاشة فقط. ولا يشفّر بياناتك.",
  "settings.offline.note": "لا يوجد اتصال. القفل واللغة وإزالة هذا الهاتف تعمل دون اتصال.",
  "settings.error.load": "تعذّر تحميل الإعدادات.",
  "settings.error.wipe": "تعذّرت إزالة هذا الهاتف بالكامل. أغلق التطبيق وحاول مرة أخرى.",
  "settings.commands.title": "الأوامر المفتوحة",
  "settings.commands.empty": "لا شيء في الانتظار.",
  "settings.commands.state.queued": "بانتظار الإرسال",
  "settings.commands.state.sent": "أُرسل وينتظر حاسوبك",
  "settings.commands.state.unknown": "لسنا متأكدين أنه نُفّذ. تحقق مرة أخرى.",
  "settings.commands.retry": "أعد المحاولة",
  "settings.commands.discard": "احذف",
};
