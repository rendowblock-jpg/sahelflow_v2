/**
 * SahelFlow Smart Confirmation Automation Engine
 *
 * Automated order confirmation system with:
 * - Multi-step confirmation sequences (WhatsApp, SMS, Call)
 * - Risk-based auto-confirmation rules
 * - Configurable reminder schedules
 * - Darija message templates
 * - Confirmation analytics tracking
 */

// ===== TYPES =====

export type ConfirmationChannel = "whatsapp" | "sms" | "call";
export type ConfirmationStatus =
  | "pending" // Awaiting first attempt
  | "sent" // Message sent, waiting response
  | "confirmed" // Customer confirmed
  | "no_response" // No response after all attempts
  | "rejected" // Customer rejected/cancelled
  | "auto_confirmed"; // Auto-confirmed by risk engine

export type ReminderStep = {
  channel: ConfirmationChannel;
  delayMinutes: number; // Minutes after order creation
  templateId: string;
  isLast: boolean;
};

export interface ConfirmationSequence {
  id: string;
  name: string;
  description: string;
  steps: ReminderStep[];
  autoConfirmBelow: number; // Risk score threshold for auto-confirm
  autoRejectAbove: number; // Risk score threshold for auto-reject
}

export interface ConfirmationAttempt {
  id: string;
  orderId: string;
  orderNumber: string;
  step: number;
  channel: ConfirmationChannel;
  status: ConfirmationStatus;
  sentAt: string;
  respondedAt?: string;
  customerResponse?: string;
  templateUsed: string;
}

export interface OrderConfirmation {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  wilaya: string;
  totalPrice: number;
  riskScore: number;
  status: ConfirmationStatus;
  currentStep: number;
  totalSteps: number;
  attempts: ConfirmationAttempt[];
  createdAt: string;
  confirmedAt?: string;
  sequenceId: string;
}

export interface ConfirmationStats {
  total: number;
  pending: number;
  confirmed: number;
  autoConfirmed: number;
  noResponse: number;
  rejected: number;
  confirmationRate: number;
  avgConfirmTime: number; // minutes
  savingsFromAutoConfirm: number;
}

// ===== CONFIRMATION TEMPLATES (Darija) =====

export const CONFIRMATION_TEMPLATES: Record<
  string,
  {
    id: string;
    channel: ConfirmationChannel;
    name: string;
    messageAr: string; // Darija
    messageFr: string; // French fallback
  }
> = {
  wa_initial: {
    id: "wa_initial",
    channel: "whatsapp",
    name: "WhatsApp - Initial Confirmation (PSA)",
    messageAr:
      'السلام عليكم {{customer_name}} 👋\nمعك {{brand}} 🏪\nعندك كوموند على {{items_summary}}\n\nعيطنالك باش نكونفيرميو لادريس ديالك 📦\nوشنو هي الولايه والبلديه باش نبعتولك الكوموند؟',
    messageFr:
      'Bonjour {{customer_name}} 👋\nIci {{brand}} 🏪\nVotre commande: {{items_summary}}\n\nNous vous contactons pour confirmer la livraison 📦\nQuelle est votre Wilaya et Commune ?',
  },
  wa_address_confirmed: {
    id: "wa_address_confirmed",
    channel: "whatsapp",
    name: "WhatsApp - Address Confirmed",
    messageAr:
      'تمام {{customer_name}} ✅\nالكوموند تاعك كونفيرمي\n📦 {{items_summary}}\n📍 {{wilaya}} - {{commune}}\n💰 {{total_price}} دينار\n🚚 التوصيل: {{delivery_type}}\nراح تلحقك في {{estimated_date}} 📅',
    messageFr:
      'Parfait {{customer_name}} ✅\nCommande confirmée\n📦 {{items_summary}}\n📍 {{wilaya}} - {{commune}}\n💰 {{total_price}} DA\n🚚 Livraison: {{delivery_type}}\nArrivée prévue le {{estimated_date}} 📅',
  },
  wa_upsell: {
    id: "wa_upsell",
    channel: "whatsapp",
    name: "WhatsApp - Upsell Offer",
    messageAr:
      'مسيو/مدام {{customer_name}} 💡\nكي تدي {{quantity_plus_one}} من {{product_name}} \nراح تشدلك {{duration}} كامل\nوراح يكون عندك تخفيض تاع {{discount}} دينار 🎉\nتحب نزيدلك؟',
    messageFr:
      'M./Mme {{customer_name}} 💡\nSi vous prenez {{quantity_plus_one}} {{product_name}}\nÇa durera {{duration}} entier\nAvec une réduction de {{discount}} DA 🎉\nOn ajoute ?',
  },
  wa_delivery: {
    id: "wa_delivery",
    channel: "whatsapp",
    name: "WhatsApp - Delivery Status",
    messageAr:
      '{{customer_name}} 📦\nالطرد تاعك خرج اليوم!\nنيميرو التتبع: {{tracking}}\nالتوصيل: {{estimated_delivery}}\nللاستفسار عيطونا على {{phone}} 📞',
    messageFr:
      '{{customer_name}} 📦\nVotre colis est parti ! \nSuivi: {{tracking}}\nLivraison: {{estimated_delivery}}\nContact: {{phone}} 📞',
  },
  wa_reminder1: {
    id: "wa_reminder1",
    channel: "whatsapp",
    name: "WhatsApp - 1st Reminder",
    messageAr:
      '⏰ {{customer_name}}، مزال ما جاوبتيناش على لاكوموند تاعك.\nباش تصرحها قولنا غير "oui". ولا حبيت تبدل خبرنا هنا 👇',
    messageFr:
      '⏰ {{customer_name}}, nous attendons votre confirmation.\nRépondez "oui" pour valider, ou contactez-nous pour modifier 👇',
  },
  wa_reminder2: {
    id: "wa_reminder2",
    channel: "whatsapp",
    name: "WhatsApp - 2nd Reminder (Urgent)",
    messageAr:
      '🔴 {{customer_name}}، الكوموند تاعك غادي تانولا اليوم يلا ما كونفيرميتش.\nجاوب "oui" باش نكملو، ولا "non" باش نبيطلوها ❌',
    messageFr:
      '🔴 {{customer_name}}, votre commande sera annulée sans réponse aujourd\'hui.\nRépondez "oui" pour continuer, ou "non" pour annuler ❌',
  },
  sms_reminder: {
    id: "sms_reminder",
    channel: "sms",
    name: "SMS - Final Reminder",
    messageAr:
      "{{brand}}: كوموند تاعك اونطونت. كونفيرمي ف الواتساب شكرا!",
    messageFr:
      "{{brand}}: Votre commande est en attente. Confirmez sur WhatsApp. Merci!",
  },
  call_script: {
    id: "call_script",
    channel: "call",
    name: "Call - Verification Script",
    messageAr:
      '📞 Script:\n"السلام، معاك {{brand}}. كوموند تاعك {{items_summary}} لـ {{wilaya}}. حبيت نكونفيرمي معاك؟"',
    messageFr:
      '📞 Script:\n"Bonjour, c\'est {{brand}}. Votre commande pour {{wilaya}}. Pouvez-vous confirmer ?"',
  },
};

// ===== DEFAULT SEQUENCES =====

export const DEFAULT_SEQUENCES: ConfirmationSequence[] = [
  {
    id: "standard",
    name: "Standard Confirmation",
    description: "WhatsApp confirmation with 2 reminders + SMS fallback",
    autoConfirmBelow: 15,
    autoRejectAbove: 85,
    steps: [
      {
        channel: "whatsapp",
        delayMinutes: 0,
        templateId: "wa_initial",
        isLast: false,
      },
      {
        channel: "whatsapp",
        delayMinutes: 120,
        templateId: "wa_reminder1",
        isLast: false,
      }, // 2h
      {
        channel: "whatsapp",
        delayMinutes: 480,
        templateId: "wa_reminder2",
        isLast: false,
      }, // 8h
      {
        channel: "sms",
        delayMinutes: 1440,
        templateId: "sms_reminder",
        isLast: true,
      }, // 24h
    ],
  },
  {
    id: "aggressive",
    name: "Aggressive (High Risk)",
    description: "Call verification for high-risk orders",
    autoConfirmBelow: 10,
    autoRejectAbove: 75,
    steps: [
      {
        channel: "whatsapp",
        delayMinutes: 0,
        templateId: "wa_initial",
        isLast: false,
      },
      {
        channel: "call",
        delayMinutes: 30,
        templateId: "call_script",
        isLast: false,
      }, // 30min
      {
        channel: "whatsapp",
        delayMinutes: 120,
        templateId: "wa_reminder2",
        isLast: false,
      }, // 2h
      {
        channel: "sms",
        delayMinutes: 360,
        templateId: "sms_reminder",
        isLast: true,
      }, // 6h
    ],
  },
  {
    id: "relaxed",
    name: "Relaxed (Trusted)",
    description: "Single WhatsApp for trusted customers",
    autoConfirmBelow: 25,
    autoRejectAbove: 90,
    steps: [
      {
        channel: "whatsapp",
        delayMinutes: 0,
        templateId: "wa_initial",
        isLast: false,
      },
      {
        channel: "whatsapp",
        delayMinutes: 1440,
        templateId: "wa_reminder1",
        isLast: true,
      }, // 24h
    ],
  },
];

// ===== CONFIRMATION ENGINE =====

export function selectSequence(riskScore: number): ConfirmationSequence {
  if (riskScore >= 50) return DEFAULT_SEQUENCES[1]; // aggressive
  if (riskScore <= 20) return DEFAULT_SEQUENCES[2]; // relaxed
  return DEFAULT_SEQUENCES[0]; // standard
}

export function shouldAutoConfirm(
  riskScore: number,
  sequence: ConfirmationSequence,
): boolean {
  return riskScore < sequence.autoConfirmBelow;
}

export function shouldAutoReject(
  riskScore: number,
  sequence: ConfirmationSequence,
): boolean {
  return riskScore > sequence.autoRejectAbove;
}

export function interpolateTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

export function parseCustomerResponse(
  message: string,
): "confirm" | "reject" | "unclear" {
  const cleanMessage = message.toLowerCase().trim().replace(/[.,!?;:]/g, '');
  const words = cleanMessage.split(/\s+/);

  const confirmWords = [
    "oui",
    "نعم",
    "ok",
    "okay",
    "yes",
    "confirm",
    "ايه",
    "wah",
    "ih",
    "sah",
    "mrig",
    "yamchi",
    "ça marche",
    "daccord",
    "d'accord",
  ];
  const rejectWords = [
    "non",
    "لا",
    "no",
    "cancel",
    "annulé",
    "annuler",
    "la",
    "makanch",
    "batal",
  ];

  if (confirmWords.some((w) => words.includes(w))) return "confirm";
  if (rejectWords.some((w) => words.includes(w))) return "reject";
  
  // As a fallback for exact matches when spaces aren't used (like 'non' alone)
  if (confirmWords.includes(cleanMessage)) return "confirm";
  if (rejectWords.includes(cleanMessage)) return "reject";

  return "unclear";
}
