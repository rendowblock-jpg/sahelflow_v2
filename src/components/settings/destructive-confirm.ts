/**
 * One contract for every destructive settings action: what it is called, whether it loses seller
 * data (then the seller must type a word), and where its words live in the three languages.
 */
export type DestructiveActionId =
  | "resetShopData"
  | "deleteShop"
  | "removeMember"
  | "revokeAiKey"
  | "disconnectGoogleSheets";

export interface DestructiveActionSpec {
  readonly id: DestructiveActionId;
  /** The seller's own records (orders, customers, products) are erased. */
  readonly losesData: boolean;
  /** The seller must type a word before the button works. Always true when data is lost. */
  readonly requiresWord: boolean;
}

export const DESTRUCTIVE_ACTIONS: Readonly<Record<DestructiveActionId, DestructiveActionSpec>> = {
  resetShopData: { id: "resetShopData", losesData: true, requiresWord: true },
  deleteShop: { id: "deleteShop", losesData: true, requiresWord: true },
  removeMember: { id: "removeMember", losesData: false, requiresWord: false },
  revokeAiKey: { id: "revokeAiKey", losesData: false, requiresWord: false },
  disconnectGoogleSheets: { id: "disconnectGoogleSheets", losesData: false, requiresWord: false },
};

export type DestructivePart = "title" | "lost" | "notAffected" | "confirm";

export function destructiveKey(id: string, part: DestructivePart): string {
  return `settings.destructive.${id}.${part}`;
}

function normalizeWord(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

/** Typed word matches: spaces around it and letter case do not matter, an empty word never matches. */
export function matchesConfirmWord(typed: string, word: string): boolean {
  const wanted = normalizeWord(word);
  return wanted.length > 0 && normalizeWord(typed) === wanted;
}

/** `word` undefined = no typing required. A running request always blocks (no double submit). */
export function canConfirmDestructive(input: {
  word: string | undefined;
  typed: string;
  busy: boolean;
}): boolean {
  if (input.busy) return false;
  if (input.word === undefined) return true;
  return matchesConfirmWord(input.typed, input.word);
}
