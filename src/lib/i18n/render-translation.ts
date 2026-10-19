import type { Locale } from "@/lib/i18n";

/**
 * Interpolation and bidi isolation for translated copy.
 *
 * These functions are pure and need no locale dictionary. They live in their own
 * module so a surface that ships its own, small set of messages (the hosted
 * storefront page, which runs in a Cloudflare Worker) can use the exact same
 * rules as the app without bundling every dashboard translation.
 * `@/lib/i18n` re-exports them, so existing imports are unchanged.
 */

const LRI = "\u2066";
const PDI = "\u2069";
const FSI = "⁨";

/**
 * One Latin/numeric word, including accented Latin letters (`Décoratif`) and
 * technical joiners (`SF-00012`, `api.v2`).
 */
const LATIN_TOKEN = String.raw`[\p{Script=Latin}0-9٠-٩۰-۹]+(?:[._:+/@#'’-][\p{Script=Latin}0-9٠-٩۰-۹]+)*`;

/**
 * A numeric range (`25-40%`) or a run of Latin words separated only by spaces
 * (`Gemini API`, `Google AI Studio`). Consecutive words form ONE island: when
 * each word was isolated on its own, the RTL paragraph laid the islands out
 * right-to-left and reversed the word order of every multi-word name.
 */
const LTR_INLINE_RUN = new RegExp(
  String.raw`(?:[0-9٠-٩۰-۹]+(?:[.,،][0-9٠-٩۰-۹]+)?\s*[%٪]?\s*[-–—]\s*[0-9٠-٩۰-۹]+(?:[.,،][0-9٠-٩۰-۹]+)?\s*[%٪]?|${LATIN_TOKEN}(?:[  ]+${LATIN_TOKEN})*(?:\s*[%٪])?)`,
  "gu",
);

/** `{{name}}` and the retained single-brace `{name}` placeholder syntax. */
const PLACEHOLDER = /(\{\{[A-Za-z0-9_]+\}\}|\{[A-Za-z0-9_]+\})/;

/**
 * Keep Arabic product copy readable when it contains Latin provider names,
 * technical IDs, percentages, dates or numeric ranges. These runs are data-like
 * LTR islands inside an RTL sentence. Unicode directional isolates are invisible
 * and do not alter the underlying copy; they only stop the bidi algorithm from
 * visually reversing punctuation/ranges or leaking direction into neighbors.
 */
export function stabilizeBidiText(value: string, locale: Locale): string {
  if (locale !== "ar" || !value) return value;
  // Placeholders pass through untouched so a template can be stabilized
  // before its values are inserted (see `renderTranslation`).
  return value
    .split(PLACEHOLDER)
    .map((part) =>
      PLACEHOLDER.test(part)
        ? part
        : part.replace(LTR_INLINE_RUN, (run) => `${LRI}${run}${PDI}`),
    )
    .join("");
}

/**
 * Resolve a translation template for display.
 *
 * Arabic stabilizes the product's own copy, then inserts every interpolated
 * value as ONE first-strong isolate. Values are seller data — customer and
 * product names, cities, order numbers, amounts — and can be Latin, Arabic or
 * mixed. Stabilizing after insertion (the former order) split a value such as
 * `Miroir Mural Décoratif` into per-word islands and broke it at the accented
 * letter, so it rendered as `coratifDé Mural Miroir`. An FSI keeps the value
 * intact and lets its own first strong character choose its direction.
 */
export function renderTranslation(
  template: string,
  params: Record<string, string | number> | undefined,
  locale: Locale,
): string {
  if (locale !== "ar") return interpolateTranslation(template, params);
  const stable = stabilizeBidiText(template, locale);
  if (!params) return stable;
  const isolated: Record<string, string> = {};
  for (const [param, value] of Object.entries(params)) {
    isolated[param] = `${FSI}${String(value)}${PDI}`;
  }
  return interpolateTranslation(stable, isolated);
}

/**
 * Product history contains both modern `{{name}}` placeholders and a smaller
 * legacy set using `{name}`. Treat both as the same interpolation contract so a
 * seller never sees raw template syntax such as `تصنيفات {count}`.
 */
export function interpolateTranslation(
  value: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return value;
  let interpolated = value;
  for (const [param, replacement] of Object.entries(params)) {
    const resolved = String(replacement);
    interpolated = interpolated
      .split(`{{${param}}}`)
      .join(resolved)
      .split(`{${param}}`)
      .join(resolved);
  }
  return interpolated;
}
