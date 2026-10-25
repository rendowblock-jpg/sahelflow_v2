/**
 * Golden set for order extraction: written-for-the-purpose Algerian customer
 * messages, labelled by meaning. Separate from the frozen corpus
 * (corpus/order-corpus.ts), which stays untouched.
 *
 * - No real customer text, name or phone. Every number is one of the fake
 *   shapes in GOLDEN_FAKE_PHONE_PATTERNS.
 * - The labels were written before the extractor was run on them and are not
 *   tuned to it. If a label is wrong, fix the label with a reason, never to
 *   make a number go up.
 * - Structure checks run in CI (__tests__/golden-set.test.ts). Accuracy is
 *   measured by hand (__tests__/zz-golden-measure.manual.test.ts).
 */
import { GOLDEN_AR } from "./part-ar";
import { GOLDEN_ARABIZI } from "./part-arabizi";
import { GOLDEN_FR } from "./part-fr";
import { GOLDEN_MIXED } from "./part-mixed";
import type { GoldenEntry } from "./types";

export type {
  GoldenEntry,
  GoldenExpected,
  GoldenItem,
  GoldenLanguage,
  GoldenSource,
} from "./types";

export const GOLDEN_SET_VERSION = "golden-1.0.0";

/**
 * The only phone numbers a golden message may carry, as normalised numbers:
 * 0555 12 34 56, 0550/0660/0770 00 00 xx and 0555 00 00 xx.
 */
export const GOLDEN_FAKE_PHONE_PATTERNS: readonly RegExp[] = [
  /^0555123456$/,
  /^0[5-7][5-7]0{5}\d{2}$/,
  /^0[5-7]{3}0{4}\d{2}$/,
];

export const GOLDEN_SET: readonly GoldenEntry[] = [
  ...GOLDEN_AR,
  ...GOLDEN_ARABIZI,
  ...GOLDEN_FR,
  ...GOLDEN_MIXED,
];
