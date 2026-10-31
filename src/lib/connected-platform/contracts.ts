/**
 * Contracts shared by the desktop, the relay worker and the phone app.
 *
 * DEPENDENCY-FREE on purpose: this file has no import of any kind, so esbuild
 * can bundle it into the phone app and into the Cloudflare worker as it is.
 * Keep it that way (contracts.test.ts reads this file and refuses an import).
 *
 * A field the signed-in member may not see is OPTIONAL and ABSENT in the row
 * types below, never null (same rule as the Today counts).
 */

// ---- Projections (what the desktop seals for the phone) -------------------

// "alerts" joins this list later with the notifications track.
export const PROJECTION_KINDS = ["dashboard", "orders", "conversations"] as const;
export type ProjectionKind = (typeof PROJECTION_KINDS)[number];

export function isProjectionKind(value: unknown): value is ProjectionKind {
  return typeof value === "string" && (PROJECTION_KINDS as readonly string[]).includes(value);
}

/** The relay stores any `projection.<x>`; this is the envelope message type. */
export function projectionMessageType(kind: ProjectionKind): `projection.${ProjectionKind}` {
  return `projection.${kind}`;
}

// ---- Commands (what the phone asks the desktop to do) ----------------------

// Not yet in the relay allow-list (command-policy.ts): the new kinds enter it
// together with the desktop executor that handles them, not before.
export const COMMAND_KINDS = [
  "command.comments.write",
  "command.orders.confirm",
  "command.orders.reject",
  "command.messages.reply",
] as const;
export type CommandKind = (typeof COMMAND_KINDS)[number];

export function isCommandKind(value: unknown): value is CommandKind {
  return typeof value === "string" && (COMMAND_KINDS as readonly string[]).includes(value);
}

/** The word the phone shows ("note" for comments.write). */
export type CommandLabel = "note" | "confirm" | "reject" | "reply";
export const COMMAND_LABELS = {
  "command.comments.write": "note",
  "command.orders.confirm": "confirm",
  "command.orders.reject": "reject",
  "command.messages.reply": "reply",
} as const satisfies Record<CommandKind, CommandLabel>;

/** `all`: every one is needed. `anyOf`: one is needed (empty = no extra need). */
export type CommandPermissionRule = Readonly<{
  all: readonly string[];
  anyOf: readonly string[];
}>;
export const COMMAND_PERMISSIONS = {
  "command.comments.write": { all: ["comments.write"], anyOf: ["orders.read", "conversations.read"] },
  "command.orders.confirm": { all: ["orders.update"], anyOf: [] },
  "command.orders.reject": { all: ["orders.update"], anyOf: [] },
  // The send route asks for both: a reply reaches a customer's phone number.
  "command.messages.reply": { all: ["conversations.reply", "customers.contact.read"], anyOf: [] },
} as const satisfies Record<CommandKind, CommandPermissionRule>;

export function commandPermitted(kind: CommandKind, granted: readonly string[]): boolean {
  const rule: CommandPermissionRule = COMMAND_PERMISSIONS[kind];
  return (
    rule.all.every((permission) => granted.includes(permission)) &&
    (rule.anyOf.length === 0 || rule.anyOf.some((permission) => granted.includes(permission)))
  );
}

const HOUR_MS = 60 * 60_000;

/** How long a queued command stays valid. A reply goes stale first. */
export const COMMAND_EXPIRY_MS = {
  "command.messages.reply": 4 * HOUR_MS,
  "command.orders.confirm": 12 * HOUR_MS,
  "command.orders.reject": 12 * HOUR_MS,
  "command.comments.write": 24 * HOUR_MS,
} as const satisfies Record<CommandKind, number>;

/** The desktop kept results 5 min; a phone that was offline needs to read them. */
export const COMMAND_RESULT_TTL_MS = 24 * HOUR_MS;

/** Same as the desktop publisher (desktop-projection.ts). */
export const PROJECTION_TTL_MS = 15 * 60_000;

// Equal to FRESH_MS and OFFLINE_WINDOW_MS in control-plane/pwa/src/today/projection.ts
// (contracts.test.ts compares them).
export const FRESH_MS = 15 * 60_000;
export const STALE_MS = 24 * HOUR_MS;

/** The phone sends the key, never translated text. Copy of src/lib/orders/rejection-reasons.ts. */
export const REJECT_REASON_KEYS = ["customerCancelled", "fakeOrder", "unreachable", "postponed"] as const;
export type RejectReasonKey = (typeof REJECT_REASON_KEYS)[number];

// ---- Size budgets (KB = 1024 bytes of plaintext before sealing) -------------

export const ORDERS_PLAINTEXT_BUDGET = 60 * 1024;
export const CONVERSATIONS_PLAINTEXT_BUDGET = 150 * 1024;
/** The sealer throws above this; it never cuts a payload silently. */
export const SEAL_HARD_LIMIT = 250 * 1024;

// ---- Windows ------------------------------------------------------------------

export const ORDERS_MAX_ROWS = 50;
export const ORDERS_WINDOW_DAYS = 14;
export const ORDER_ITEMS_PER_ROW = 3;
export const CONVERSATIONS_MAX = 20;
export const MESSAGES_PER_CONVERSATION = 10;
export const MESSAGE_TEXT_MAX_CHARS = 1000;

// ---- projection.orders ---------------------------------------------------------

export type OrderProjectionItem = Readonly<{ name: string; qty: number }>;

export type OrderProjectionRow = Readonly<{
  id: string;
  orderNumber: string;
  status: string;
  /** The version the phone must send back with confirm / reject. */
  version: number;
  createdAt: string;
  /** Absent unless the member may see customer contact (the workbench gates it). */
  wilaya?: string;
  /** At most ORDER_ITEMS_PER_ROW; the rest is counted in moreCount. */
  items: readonly OrderProjectionItem[];
  moreCount: number;
  source: string;
  /** Absent unless the member may see order amounts. */
  totalPrice?: number;
  /** The three below are absent unless the member may see customer contact. */
  customerName?: string;
  phone?: string;
  address?: string;
  noteCount: number;
  /** The version the phone must send back with a note. */
  noteVersion: number;
}>;

export type OrdersProjectionWindow = Readonly<{
  shown: number;
  pendingTotal: number;
  truncated: boolean;
}>;

export type OrdersProjection = Readonly<{
  orders: readonly OrderProjectionRow[];
  window: OrdersProjectionWindow;
}>;

// ---- projection.conversations ----------------------------------------------------

/** An attachment is a placeholder: the type only, no url, no media. */
export const CONVERSATION_MESSAGE_TYPES = [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "other",
] as const;
export type ConversationMessageType = (typeof CONVERSATION_MESSAGE_TYPES)[number];

export type ConversationMessageRow = Readonly<{
  id: string;
  direction: "in" | "out";
  /** At most MESSAGE_TEXT_MAX_CHARS characters. */
  text: string;
  /** True when `text` was cut at MESSAGE_TEXT_MAX_CHARS. */
  truncated: boolean;
  at: string;
  deliveryStatus: string;
  /** Held by the PC's send guard; the phone only shows it. */
  held: boolean;
  type: ConversationMessageType;
}>;

export type ConversationRow = Readonly<{
  id: string;
  /** Absent unless the member may see customer contact. */
  contactName?: string;
  /** Absent unless the member may see customer contact. */
  phone?: string;
  status: string;
  unread: number;
  lastAt: string;
  noteVersion: number;
  /** Oldest first, at most MESSAGES_PER_CONVERSATION. */
  messages: readonly ConversationMessageRow[];
}>;

export type ConversationsProjectionWindow = Readonly<{
  /** How many conversations are in this projection. */
  conversations: number;
  /** The most messages any conversation carries. */
  perConversationMessages: number;
}>;

export type ConversationsProjection = Readonly<{
  conversations: readonly ConversationRow[];
  window: ConversationsProjectionWindow;
}>;
