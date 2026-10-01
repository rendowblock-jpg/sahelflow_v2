import type { Locale } from "@/lib/i18n";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";

import type { AutomationBuilderPreset, BuilderStep } from "./flow-model";

export type AutomationTemplateCategory = "confirm" | "delivery" | "operations";

export interface AutomationTemplate {
  key: string;
  category: AutomationTemplateCategory;
  nameKey: AutomationWorkspaceCopyKey;
  descKey: AutomationWorkspaceCopyKey;
  build: (locale: Locale) => AutomationBuilderPreset;
}

type Localized = Record<"en" | "fr" | "ar", string>;

function pick(locale: Locale, text: Localized): string {
  return text[locale as keyof Localized] ?? text.en;
}

const TEXT = {
  confirm: {
    en: "Hi {{customerName}}, we received your order {{orderNumber}} ({{totalPrice}} DZD) and will confirm it with you shortly.",
    fr: "Bonjour {{customerName}}, nous avons bien reçu votre commande {{orderNumber}} ({{totalPrice}} DZD) et allons la confirmer avec vous.",
    ar: "مرحباً {{customerName}}، استلمنا طلبك {{orderNumber}} ({{totalPrice}} دج) وسنتواصل معك لتأكيده.",
  },
  remind: {
    en: "Reminder: your order {{orderNumber}} is waiting for confirmation. Reply YES to confirm it.",
    fr: "Rappel : votre commande {{orderNumber}} attend votre confirmation. Répondez OUI pour la confirmer.",
    ar: "تذكير: طلبك {{orderNumber}} بانتظار التأكيد. أرسل «نعم» لتأكيده.",
  },
  shipped: {
    en: "Your order {{orderNumber}} has shipped and is on its way to {{wilaya}}. Please keep {{totalPrice}} DZD ready for the courier.",
    fr: "Votre commande {{orderNumber}} a été expédiée vers {{wilaya}}. Merci de préparer {{totalPrice}} DZD pour le livreur.",
    ar: "تم شحن طلبك {{orderNumber}} إلى {{wilaya}}. يرجى تجهيز {{totalPrice}} دج لعامل التوصيل.",
  },
  thanks: {
    en: "Thank you for choosing us! We hope you are happy with order {{orderNumber}}.",
    fr: "Merci pour votre confiance ! Nous espérons que votre commande {{orderNumber}} vous satisfait.",
    ar: "شكراً لاختيارك متجرنا! نتمنى أن تكون راضياً عن طلبك {{orderNumber}}.",
  },
  highValue: {
    en: "High-value COD order {{orderNumber}} — {{totalPrice}} DZD",
    fr: "Commande COD à forte valeur {{orderNumber}} — {{totalPrice}} DZD",
    ar: "طلب مرتفع القيمة {{orderNumber}} — {{totalPrice}} دج",
  },
  refusedAlert: {
    en: "Order {{orderNumber}} was refused at delivery in {{wilaya}}.",
    fr: "La commande {{orderNumber}} a été refusée à la livraison à {{wilaya}}.",
    ar: "رُفض استلام الطلب {{orderNumber}} في {{wilaya}}.",
  },
  refusedNote: {
    en: "Refused delivery of {{orderNumber}} ({{totalPrice}} DZD)",
    fr: "Livraison refusée de {{orderNumber}} ({{totalPrice}} DZD)",
    ar: "رفض استلام {{orderNumber}} ({{totalPrice}} دج)",
  },
  returned: {
    en: "A return was recorded for order {{orderNumber}} ({{wilaya}}).",
    fr: "Un retour a été enregistré pour la commande {{orderNumber}} ({{wilaya}}).",
    ar: "تم تسجيل مرتجع للطلب {{orderNumber}} ({{wilaya}}).",
  },
  lowStock: {
    en: "Low stock: {{productName}} has {{stockLevel}} left (threshold {{lowStockThreshold}}).",
    fr: "Stock faible : il reste {{stockLevel}} {{productName}} (seuil {{lowStockThreshold}}).",
    ar: "مخزون منخفض: تبقّى {{stockLevel}} من {{productName}} (الحد {{lowStockThreshold}}).",
  },
  newMessage: {
    en: "New message from {{customerName}}: {{messageText}}",
    fr: "Nouveau message de {{customerName}} : {{messageText}}",
    ar: "رسالة جديدة من {{customerName}}: {{messageText}}",
  },
  blacklisted: {
    en: "{{customerName}} ({{customerPhone}}) was added to the blacklist.",
    fr: "{{customerName}} ({{customerPhone}}) a été ajouté à la liste noire.",
    ar: "تمت إضافة {{customerName}} ({{customerPhone}}) إلى القائمة السوداء.",
  },
} satisfies Record<string, Localized>;

function whatsapp(messageTemplate: string): BuilderStep {
  return { action: "send_whatsapp", onFailure: "stop", config: { messageTemplate } };
}
function notify(messageTemplate: string): BuilderStep {
  return { action: "send_notification", onFailure: "stop", config: { messageTemplate } };
}
function note(noteText: string): BuilderStep {
  return { action: "tag_customer", onFailure: "stop", config: { noteText } };
}

function template(
  key: string,
  category: AutomationTemplateCategory,
  copyKey: string,
  preset: (locale: Locale) => Omit<AutomationBuilderPreset, "name">,
): AutomationTemplate {
  const nameKey = `template.${copyKey}.name` as AutomationWorkspaceCopyKey;
  return {
    key,
    category,
    nameKey,
    descKey: `template.${copyKey}.desc` as AutomationWorkspaceCopyKey,
    build: (locale) => ({ name: getAutomationWorkspaceCopy(locale, nameKey), ...preset(locale) }),
  };
}

/**
 * Seller-ready starting points. Every one is a valid flow for its trigger
 * (actions, variables and status rules), so "Use template" opens a builder
 * that can be saved as is.
 */
export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  template("confirmation", "confirm", "confirmation", (locale) => ({
    trigger: "order.created",
    steps: [whatsapp(pick(locale, TEXT.confirm))],
  })),
  template("confirm-reminder", "confirm", "confirmReminder", (locale) => ({
    trigger: "order.created",
    steps: [
      whatsapp(pick(locale, TEXT.confirm)),
      { action: "wait", onFailure: "stop", config: { delayMinutes: 180 } },
      { action: "recheck_order_status", onFailure: "stop", config: { expectedStatus: "pending" } },
      whatsapp(pick(locale, TEXT.remind)),
    ],
  })),
  template("high-value", "confirm", "highValue", (locale) => ({
    trigger: "order.created",
    conditions: { all: [{ field: "totalPrice", operator: "greater_than", value: "7000" }] },
    steps: [note(pick(locale, TEXT.highValue))],
  })),
  template("delivery", "delivery", "delivery", (locale) => ({
    trigger: "order.shipped",
    steps: [whatsapp(pick(locale, TEXT.shipped))],
  })),
  template("thanks", "delivery", "thanks", (locale) => ({
    trigger: "order.delivered",
    steps: [whatsapp(pick(locale, TEXT.thanks))],
  })),
  template("refused", "delivery", "refused", (locale) => ({
    trigger: "order.refused",
    steps: [notify(pick(locale, TEXT.refusedAlert)), note(pick(locale, TEXT.refusedNote))],
  })),
  template("returned", "delivery", "returned", (locale) => ({
    trigger: "order.returned",
    steps: [notify(pick(locale, TEXT.returned))],
  })),
  template("low-stock", "operations", "lowStock", (locale) => ({
    trigger: "stock.low",
    steps: [notify(pick(locale, TEXT.lowStock))],
  })),
  template("new-message", "operations", "newMessage", (locale) => ({
    trigger: "message.received",
    steps: [notify(pick(locale, TEXT.newMessage))],
  })),
  template("blacklisted", "operations", "blacklisted", (locale) => ({
    trigger: "customer.blacklisted",
    steps: [notify(pick(locale, TEXT.blacklisted))],
  })),
];

export function findAutomationTemplate(key: string | undefined): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((candidate) => candidate.key === key);
}
