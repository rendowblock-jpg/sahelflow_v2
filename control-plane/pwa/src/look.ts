// The four looks of the SahelFlow desktop app (src/lib/appearance/preset.ts), chosen on the phone in Settings.
// Light / dark is a separate choice (Theme). The colours of each look are in styles/looks.css, generated from the desktop's files.
export const LOOKS = ["sahel", "atlas", "oasis", "dune"] as const;
export type Look = (typeof LOOKS)[number];
export const DEFAULT_LOOK: Look = "sahel";
export const LOOK_KEY = "sf.look";
/** A saved or typed value that is not one of the four (for example nothing saved yet) counts as not chosen: the default look. */
export function parseLook(value: unknown): Look { return LOOKS.find((l) => l === value) ?? DEFAULT_LOOK; }
