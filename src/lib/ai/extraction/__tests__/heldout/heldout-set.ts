import type { HeldoutEntry } from "./scorer";
import { HELDOUT_AR } from "./part-ar";
import { HELDOUT_PHONE_FORMATS, HELDOUT_WILAYAS } from "./part-formats";
import { HELDOUT_FR } from "./part-fr";
import { HELDOUT_HOSTILE } from "./part-hostile";
import { HELDOUT_LATIN } from "./part-latin";

/**
 * Held-out set v1. Written by meaning BEFORE the offline reader was run on it;
 * the reader may not be tuned to single sentences of this set. Label rules are
 * in build.ts. Do not edit an entry to make the reader pass: a label is only
 * changed when it states something the message does not say.
 */
export const HELDOUT_SET_VERSION = "heldout-1.0.0";

export const HELDOUT_SET: readonly HeldoutEntry[] = [
  ...HELDOUT_AR,
  ...HELDOUT_LATIN,
  ...HELDOUT_FR,
  ...HELDOUT_PHONE_FORMATS,
  ...HELDOUT_WILAYAS,
  ...HELDOUT_HOSTILE,
];
