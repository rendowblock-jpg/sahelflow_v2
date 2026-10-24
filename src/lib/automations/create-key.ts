// The key that makes "create automation" safe to send twice (INT-14). Plain functions with no server imports, so the browser
// screens and the route share one definition of a valid key.

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAutomationCreateKey(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value);
}

export function newAutomationCreateKey(): string {
  return crypto.randomUUID();
}

/** The key of one draft and the exact content it was first sent with. */
export interface AutomationDraftKey {
  key: string;
  fingerprint: string;
}

/**
 * Reuse the draft's key for a retry of the same content. The server refuses a used key that arrives with other content, so a
 * draft that was edited after a failed save gets a new key. The caller sets its stored value to null after a successful save.
 */
export function automationCreateKeyForDraft(
  previous: AutomationDraftKey | null,
  fingerprint: string,
  mint: () => string = newAutomationCreateKey,
): AutomationDraftKey {
  if (previous && previous.fingerprint === fingerprint) return previous;
  return { key: mint(), fingerprint };
}
