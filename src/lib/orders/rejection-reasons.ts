/**
 * Locale-stable rejection reasons (AAA audit F16).
 *
 * The confirmation-queue and order-detail quick-picks previously submitted the
 * TRANSLATED UI label as the stored rejection reason, so the persisted value
 * depended on whichever locale the reviewer was using — a locale switch
 * mid-review broke selection highlighting and mixed ar/fr/en strings into the
 * order change ledger.
 *
 * Quick-picks now submit a locale-stable enum key; translation happens at
 * display (order-timeline). Legacy rows that already stored a translated label
 * keep rendering verbatim — `matchRejectionReasonLabel` maps a current-locale
 * label back to its key only for submission round-tripping.
 */
export const REJECTION_REASONS = [
  {
    key: "customerCancelled",
    i18nKey: "confirmationQueue.reject.reason.customerCancelled",
  },
  {
    key: "fakeOrder",
    i18nKey: "confirmationQueue.reject.reason.fakeOrder",
  },
  {
    key: "unreachable",
    i18nKey: "confirmationQueue.reject.reason.unreachable",
  },
  {
    key: "postponed",
    i18nKey: "confirmationQueue.reject.reason.postponed",
  },
] as const;

export type RejectionReasonKey = (typeof REJECTION_REASONS)[number]["key"];

const REJECTION_REASON_I18N_KEYS: Record<RejectionReasonKey, string> = {
  customerCancelled: "confirmationQueue.reject.reason.customerCancelled",
  fakeOrder: "confirmationQueue.reject.reason.fakeOrder",
  unreachable: "confirmationQueue.reject.reason.unreachable",
  postponed: "confirmationQueue.reject.reason.postponed",
};

type TFunc = (key: string, params?: Record<string, string | number>) => string;

export function isRejectionReasonKey(
  value: string,
): value is RejectionReasonKey {
  return REJECTION_REASONS.some((reason) => reason.key === value);
}

/**
 * What the form should submit: an explicit quick-pick pick wins; otherwise a
 * free-text value that exactly matches a quick-pick label in the current
 * locale is normalized to its key; everything else is submitted verbatim.
 */
export function resolveRejectionReasonSubmit(
  pickedKey: RejectionReasonKey | null,
  freeText: string,
  t: TFunc,
): string {
  if (pickedKey) return pickedKey;
  const trimmed = freeText.trim();
  if (!trimmed) return "";
  return matchRejectionReasonLabel(trimmed, t) ?? trimmed;
}

/** Current-locale quick-pick label → enum key (legacy round-trip support). */
export function matchRejectionReasonLabel(
  value: string,
  t: TFunc,
): RejectionReasonKey | null {
  if (!value) return null;
  for (const reason of REJECTION_REASONS) {
    if (t(reason.i18nKey) === value) return reason.key;
  }
  return null;
}

/**
 * Display a stored rejection reason: enum keys translate to the active
 * locale; legacy translated labels render as-is (the audit's "otherwise
 * render as-is" contract).
 */
export function rejectionReasonDisplay(value: string, t: TFunc): string {
  return isRejectionReasonKey(value)
    ? t(REJECTION_REASON_I18N_KEYS[value])
    : value;
}
