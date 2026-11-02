// The logo tile of an integration. Kept in its own file so both the home page and the inner pages can use it without an import cycle.
import { esc, icon } from "./ui.mjs";
import { logoFile } from "./brands.mjs";

/**
 * <span class="brand-tile"> holding the brand's logo as a picture, or a neutral glyph when the brand is shown by name only.
 * The class attribute is exactly `brand-tile`: a test counts it against the status labels, so no tile can appear without one.
 */
export function brandTile(key, size = 44) {
  const file = logoFile(key);
  if (!file) return `<span class="brand-tile" data-neutral aria-hidden="true">${icon("agents")}</span>`;
  return `<span class="brand-tile" aria-hidden="true"><img src="/img/brands/${esc(file)}" alt="" width="${size}" height="${size}" decoding="async"></span>`;
}
