import { shopDateString } from "@/lib/time/shop-day";

/**
 * The nine things the seller is told about. One place decides, for each kind:
 * who may see it, how loud it is, how often it may appear (the dedupe key) and
 * which words it uses. The marker written for it never carries a name, an
 * amount, a phone number or message text: the number in the sentence is
 * counted from the database when the list is read (see live-state.ts).
 */
export const NOTIFICATION_KINDS = [
  "order.new",
  "orders.toConfirm",
  "delivery.failed",
  "whatsapp.received",
  "whatsapp.held",
  "backup.failed",
  "licence.ending",
  "update.available",
  "ai.quota",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationAction = "orders.read" | "conversations.read" | "settings.read";

export interface KindSpec {
  readonly kind: NotificationKind;
  readonly eventType: string;
  readonly requiredAction: NotificationAction;
  /** Fixed in-app destination. whatsapp.received adds the conversation id. */
  readonly link: string;
  readonly severity: NotificationSeverity;
  readonly inAppDefault: boolean;
  /** Width of the dedupe bucket, null when the key has no time bucket. */
  readonly bucketMinutes: number | null;
  /** The sentence carries a number counted live. */
  readonly counted: boolean;
  /** Several rows of this kind close together fold into one line with a total. */
  readonly groupable: boolean;
  readonly expiresDays: number;
  /** English reference sentence; {count} is the live number. */
  readonly sentence: string;
  readonly titleKey: string;
  readonly bodyKey: string;
}

function mk(
  kind: NotificationKind,
  rest: Omit<KindSpec, "kind" | "eventType" | "inAppDefault" | "titleKey" | "bodyKey">,
): KindSpec {
  return {
    kind,
    eventType: `${kind}.v1`,
    inAppDefault: true,
    titleKey: `notifications.events.${kind}.title`,
    bodyKey: `notifications.events.${kind}.body`,
    ...rest,
  };
}

export const KIND_SPECS: Record<NotificationKind, KindSpec> = {
  "order.new": mk("order.new", {
    requiredAction: "orders.read", link: "/orders?status=pending", severity: "info",
    bucketMinutes: 10, counted: true, groupable: true, expiresDays: 90,
    sentence: "{count} new orders came in.",
  }),
  "orders.toConfirm": mk("orders.toConfirm", {
    requiredAction: "orders.read", link: "/orders?status=pending", severity: "info",
    bucketMinutes: null, counted: true, groupable: false, expiresDays: 90,
    sentence: "You have {count} orders to confirm.",
  }),
  "delivery.failed": mk("delivery.failed", {
    requiredAction: "orders.read", link: "/deliveries", severity: "warning",
    bucketMinutes: null, counted: true, groupable: true, expiresDays: 90,
    sentence: "A delivery could not be completed. Open SahelFlow to see which.",
  }),
  "whatsapp.received": mk("whatsapp.received", {
    requiredAction: "conversations.read", link: "/inbox", severity: "info",
    bucketMinutes: 5, counted: true, groupable: true, expiresDays: 365,
    sentence: "You have {count} new WhatsApp messages.",
  }),
  "whatsapp.held": mk("whatsapp.held", {
    requiredAction: "conversations.read", link: "/inbox", severity: "warning",
    bucketMinutes: null, counted: true, groupable: false, expiresDays: 90,
    sentence: "A WhatsApp message is waiting for your OK.",
  }),
  "backup.failed": mk("backup.failed", {
    requiredAction: "settings.read", link: "/settings?section=backup", severity: "warning",
    bucketMinutes: null, counted: false, groupable: false, expiresDays: 90,
    sentence: "Your last backup did not finish. Your data is still on this PC, but not copied. Open SahelFlow to try again.",
  }),
  "licence.ending": mk("licence.ending", {
    requiredAction: "settings.read", link: "/settings?section=license", severity: "warning",
    bucketMinutes: null, counted: true, groupable: false, expiresDays: 90,
    sentence: "Your access to SahelFlow ends in {count} days.",
  }),
  "update.available": mk("update.available", {
    requiredAction: "settings.read", link: "/settings?section=license", severity: "info",
    bucketMinutes: null, counted: false, groupable: false, expiresDays: 90,
    sentence: "A new version of SahelFlow is ready.",
  }),
  "ai.quota": mk("ai.quota", {
    requiredAction: "settings.read", link: "/settings?section=license", severity: "info",
    bucketMinutes: null, counted: false, groupable: false, expiresDays: 30,
    sentence: "The AI helper is resting for a while (free limit reached). Everything else works.",
  }),
};

/** Event rows written before the kinds existed keep their old type name. */
const LEGACY_EVENT_TYPES: Readonly<Record<string, NotificationKind>> = {
  "whatsapp.message.received.v1": "whatsapp.received",
};

export function kindOfEventType(eventType: string): NotificationKind | null {
  const legacy = LEGACY_EVENT_TYPES[eventType];
  if (legacy) return legacy;
  for (const kind of NOTIFICATION_KINDS) {
    if (KIND_SPECS[kind].eventType === eventType) return kind;
  }
  return null;
}

export function bucketStartMs(atMs: number, bucketMinutes: number): number {
  const width = bucketMinutes * 60_000;
  return Math.floor(atMs / width) * width;
}

/**
 * Only an id-like token may enter a marker. Anything with a space, a plus, an
 * at-sign, a long run of digits (a phone number) or more than 64 characters is
 * replaced by "none": the marker loses precision rather than carry personal data.
 */
export function safeToken(value: string | undefined | null): string {
  if (typeof value !== "string") return "none";
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(value)) return "none";
  if (/\d{9,}/.test(value)) return "none";
  return value;
}

export interface EventKeyInput {
  kind: NotificationKind;
  at: Date;
  /** conversation id, delivery id, provider, licence expiry day */
  subject?: string;
  /** delivery status, licence threshold, version, pause end */
  variant?: string;
}

/** KIND + SHOP-DAY + BUCKET (+ subject): the same fact never makes a second row. */
export function buildEventKey(input: EventKeyInput): string {
  const { kind, at } = input;
  const day = shopDateString(at);
  const subject = safeToken(input.subject);
  const variant = safeToken(input.variant);
  const bucketMinutes = KIND_SPECS[kind].bucketMinutes;
  const bucket = bucketMinutes === null ? "" : String(bucketStartMs(at.getTime(), bucketMinutes) / 60_000);
  switch (kind) {
    case "order.new":
      return `order.new:${day}:${bucket}`;
    case "orders.toConfirm":
      return `orders.toConfirm:${day}`;
    case "delivery.failed":
      return `delivery.failed:${subject}:${variant}`;
    case "whatsapp.received":
      return `whatsapp.received:${day}:${subject}:${bucket}`;
    case "whatsapp.held":
      return `whatsapp.held:${day}:${subject}`;
    case "backup.failed":
      return `backup.failed:${day}`;
    case "licence.ending":
      return `licence.ending:${subject}:${variant}`;
    case "update.available":
      return `update.available:${variant}`;
    case "ai.quota":
      return `ai.quota:${subject}:${variant}`;
  }
}

export function linkFor(kind: NotificationKind, subject?: string): string {
  const spec = KIND_SPECS[kind];
  if (kind === "whatsapp.received" && subject && safeToken(subject) !== "none") {
    return `/inbox?conversation=${encodeURIComponent(subject)}`;
  }
  return spec.link;
}

/** A pending order older than this makes the line a warning (strictly older). */
export const TO_CONFIRM_WARNING_AGE_MS = 2 * 60 * 60_000;

export function toConfirmSeverity(oldestAgeMs: number): NotificationSeverity {
  return oldestAgeMs > TO_CONFIRM_WARNING_AGE_MS ? "warning" : "info";
}

export function backupSeverity(input: {
  consecutiveFailures: number;
  daysSinceGoodBackup: number;
}): NotificationSeverity {
  return input.consecutiveFailures >= 2 || input.daysSinceGoodBackup >= 3 ? "critical" : "warning";
}

export type LicenceThreshold = "7" | "3" | "1" | "expired";

/** daysLeft is whole days remaining; each threshold is told once. */
export function licenceThreshold(daysLeft: number): LicenceThreshold | null {
  if (daysLeft <= 0) return "expired";
  if (daysLeft <= 1) return "1";
  if (daysLeft <= 3) return "3";
  if (daysLeft <= 7) return "7";
  return null;
}

export function licenceSeverity(threshold: LicenceThreshold): NotificationSeverity {
  return threshold === "expired" ? "critical" : "warning";
}

export function asSeverity(value: string): NotificationSeverity {
  return value === "critical" || value === "warning" ? value : "info";
}
