/**
 * One place that decides what a seller reads for a conversation or contact.
 *
 * F-0028 (seen on the Founder's installed Internal.48, Arabic inbox): rows were
 * titled with the raw WhatsApp id ("202460866064562@lid") and the avatar circle
 * showed a digit. The ingest path stores `pushName || phone || sourceId` as the
 * contact name, so the raw id lands in the name column; the display therefore
 * cannot trust the name field alone.
 *
 * Rules (pure, no I/O, safe on the server and in the browser):
 *  1. A known name wins.
 *  2. A stored name that is only an identifier (a JID, a LID, the digits of
 *     the id, a run of digits too long for a phone) is NOT a name.
 *  3. A phone number is derived ONLY from a phone-number JID
 *     (`digits@s.whatsapp.net`, `:device` stripped). A LID carries no phone.
 *  4. Otherwise a neutral label plus a short stable suffix (last 4 digits).
 *  5. The raw id never reaches visible text or an aria-label.
 */

export type TitleLocale = "ar" | "fr" | "en";

export interface TitleInput {
  /** The stored contact name; may be empty or may itself be a raw id. */
  name?: string | null;
  /** The provider address (JID/LID). Used for classification only, never shown. */
  sourceId?: string | null;
  locale?: string | null;
  /** A group subject, when the provider gave one. */
  groupSubject?: string | null;
}

export type TitleKind = "name" | "phone" | "unknown" | "group";

export interface TitleParts {
  text: string;
  /** `name` is the seller's own text (dir auto); the others are generated. */
  kind: TitleKind;
}

const UNKNOWN_CONTACT: Record<TitleLocale, string> = {
  en: "Unknown contact",
  fr: "Contact inconnu",
  ar: "جهة اتصال غير معروفة",
};

const GROUP_LABEL: Record<TitleLocale, string> = {
  en: "Group",
  fr: "Groupe",
  ar: "مجموعة",
};

/** Left-to-right isolate: keeps "+213 791 99 91 57" in order inside Arabic text. */
const LRI = "\u2066";
const PDI = "\u2069";

const PHONE_SERVERS = new Set(["s.whatsapp.net", "c.us"]);
const SERVER_IN_TEXT =
  /@(?:lid|hosted\.lid|hosted|s\.whatsapp\.net|c\.us|g\.us|broadcast|newsletter)\b/iu;
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/gu;

/** Longest national number plus country code (E.164). */
const MAX_PHONE_DIGITS = 15;
const MIN_PHONE_DIGITS = 8;

/** Country calling codes the Algerian shop is likely to meet; longest match wins. */
const COUNTRY_CODES = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "39", "41", "43", "44", "46", "49",
  "90", "91", "212", "213", "216", "218", "220", "221", "222", "223", "225", "249",
  "961", "962", "963", "964", "965", "966", "968", "971", "974",
] as const;

export function normalizeTitleLocale(locale: string | null | undefined): TitleLocale {
  const base = (locale ?? "").toLowerCase().slice(0, 2);
  return base === "ar" || base === "fr" ? base : "en";
}

type ParsedId =
  | { kind: "phone" | "lid" | "group" | "other"; digits: string }
  | { kind: "none"; digits: "" };

const NO_ID: ParsedId = { kind: "none", digits: "" };

/** Classify a provider address. Anything without `@server` is not an address. */
export function parseConversationId(raw: string | null | undefined): ParsedId {
  const text = (raw ?? "").trim();
  const at = text.lastIndexOf("@");
  if (at <= 0 || at === text.length - 1) return NO_ID;
  const server = text.slice(at + 1).toLowerCase();
  const local = text.slice(0, at);
  // `user_agent:device` — only the user part identifies the contact.
  const user = local.split(":")[0]?.split("_")[0] ?? "";
  if (PHONE_SERVERS.has(server)) {
    const digits = user.replace(/\D/gu, "");
    return /^\d{6,15}$/u.test(user)
      ? { kind: "phone", digits }
      : { kind: "other", digits };
  }
  if (server === "lid" || server === "hosted.lid") {
    return { kind: "lid", digits: user.replace(/\D/gu, "") };
  }
  if (server === "g.us") {
    return { kind: "group", digits: local.replace(/\D/gu, "") };
  }
  return { kind: "other", digits: user.replace(/\D/gu, "") };
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(CONTROL_CHARS, " ").replace(/\s+/gu, " ").trim();
}

function chunk(digits: string, sizes: readonly number[]): string {
  const parts: string[] = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  if (at < digits.length) parts.push(digits.slice(at));
  return parts.join(" ");
}

/** Greedy groups of 3 from the start; a lone last digit joins the group before. */
function genericGroups(digits: string): string {
  const parts: string[] = [];
  for (let at = 0; at < digits.length; at += 3) parts.push(digits.slice(at, at + 3));
  const last = parts[parts.length - 1];
  const before = parts[parts.length - 2];
  if (last !== undefined && before !== undefined && last.length === 1) {
    parts.splice(parts.length - 2, 2, before.slice(0, 2), `${before.slice(2)}${last}`);
  }
  return parts.join(" ");
}

/** `+` and digits in country groups. Not isolated: callers decide (see isolate). */
export function formatInternationalPhone(digits: string): string {
  const cleaned = digits.replace(/\D/gu, "");
  const code = [...COUNTRY_CODES]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => cleaned.startsWith(candidate) && cleaned.length > candidate.length + 4);
  if (!code) return `+${genericGroups(cleaned)}`;
  const national = cleaned.slice(code.length);
  let grouped: string;
  if (code === "213") {
    grouped = national.length === 9 ? chunk(national, [3, 2, 2, 2]) : chunk(national, [2, 2, 2, 2]);
  } else if (code === "33" && national.length === 9) {
    grouped = chunk(national, [1, 2, 2, 2, 2]);
  } else if (code === "1" && national.length === 10) {
    grouped = chunk(national, [3, 3, 4]);
  } else {
    grouped = genericGroups(national);
  }
  return `+${code} ${grouped}`;
}

function isolate(text: string, locale: TitleLocale): string {
  return locale === "ar" ? `${LRI}${text}${PDI}` : text;
}

/** `real name` | `phone digits` | `nothing usable` for a stored name. */
function classifyStoredName(
  name: string,
  id: ParsedId,
): { kind: "name" } | { kind: "phone"; digits: string } | { kind: "none" } {
  if (!name) return { kind: "none" };
  if (SERVER_IN_TEXT.test(name)) return { kind: "none" };
  if (/^\+?\d+$/u.test(name)) {
    const digits = name.replace(/\D/gu, "");
    if (digits.length < MIN_PHONE_DIGITS) return { kind: "name" };
    if (digits.length > MAX_PHONE_DIGITS) return { kind: "none" };
    // The digits of a LID or group id are not a phone number and not a name.
    if ((id.kind === "lid" || id.kind === "group") && digits === id.digits) return { kind: "none" };
    return { kind: "phone", digits };
  }
  return { kind: "name" };
}

function suffixOf(digits: string): string {
  return digits.length > 0 ? ` ·${digits.slice(-4)}` : "";
}

export function conversationTitleParts(input: TitleInput): TitleParts {
  const locale = normalizeTitleLocale(input.locale);
  const name = cleanText(input.name);
  const fromSource = parseConversationId(input.sourceId);
  // The fallback projection has no source id, but the stored name may be one.
  const id = fromSource.kind !== "none" ? fromSource : parseConversationId(SERVER_IN_TEXT.test(name) ? name : null);

  const stored = classifyStoredName(name, id);
  if (stored.kind === "name") return { text: name, kind: "name" };
  if (stored.kind === "phone") {
    return { text: isolate(formatInternationalPhone(stored.digits), locale), kind: "phone" };
  }

  if (id.kind === "phone") {
    return { text: isolate(formatInternationalPhone(id.digits), locale), kind: "phone" };
  }
  if (id.kind === "group") {
    const subject = cleanText(input.groupSubject);
    if (subject && !SERVER_IN_TEXT.test(subject)) return { text: subject, kind: "name" };
    return { text: `${GROUP_LABEL[locale]}${suffixOf(id.digits)}`, kind: "group" };
  }
  return { text: `${UNKNOWN_CONTACT[locale]}${suffixOf(id.digits)}`, kind: "unknown" };
}

/** What the row, the header, search results and every other surface print. */
export function conversationDisplayTitle(input: TitleInput): string {
  return conversationTitleParts(input).text;
}

/**
 * The letter in the avatar circle. `null` means "show the person glyph":
 * returned for every contact without a real name, and for a name with no
 * letter in it. Never a digit.
 */
export function conversationAvatarInitial(input: TitleInput): string | null {
  const parts = conversationTitleParts(input);
  if (parts.kind !== "name") return null;
  const letter = Array.from(parts.text).find((char) => /\p{L}/u.test(char));
  return letter ? letter.toLocaleUpperCase() : null;
}

/**
 * The phone line under a title. A LID (or group id) that an older writer stored
 * in the phone column is not a phone number and is dropped.
 */
export function conversationDisplayPhone(input: {
  phone?: string | null;
  sourceId?: string | null;
  locale?: string | null;
}): string | null {
  const locale = normalizeTitleLocale(input.locale);
  const id = parseConversationId(input.sourceId);
  const digits = cleanText(input.phone).replace(/\D/gu, "");
  if (digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS) {
    if ((id.kind === "lid" || id.kind === "group") && digits === id.digits) return null;
    return isolate(formatInternationalPhone(digits), locale);
  }
  if (id.kind === "phone") return isolate(formatInternationalPhone(id.digits), locale);
  return null;
}

/**
 * Locale-free label for surfaces built on the server (unread toast, native
 * notification preview, search index): a real name, or the phone from a
 * phone-number JID, or `null` so the caller shows its own generic wording.
 */
export function conversationSafeLabel(input: {
  name?: string | null;
  sourceId?: string | null;
  /** Wrap a phone in a left-to-right isolate (text that may land in an Arabic sentence). */
  isolatePhone?: boolean;
}): string | null {
  const parts = conversationTitleParts({ name: input.name, sourceId: input.sourceId, locale: "en" });
  if (parts.kind === "name") return parts.text;
  if (parts.kind === "phone") return input.isolatePhone ? `${LRI}${parts.text}${PDI}` : parts.text;
  return null;
}

/**
 * The stored name when it is a real name, otherwise an empty string. API
 * answers use it so a raw id is never sent as a `name`; the client forms the
 * localized title from the empty name and the address.
 */
export function conversationKnownName(input: {
  name?: string | null;
  sourceId?: string | null;
}): string {
  const parts = conversationTitleParts({ name: input.name, sourceId: input.sourceId, locale: "en" });
  return parts.kind === "name" ? parts.text : "";
}
