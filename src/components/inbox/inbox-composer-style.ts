/*
 * The Inbox reply field. One place for the colours so the contract test can
 * compute the contrast from the SAME numbers the browser renders:
 *   border      = color-mix(in oklab, foreground P%, background)  >= 3:1
 *   placeholder = color-mix(in oklab, foreground P%, card)        >= 4.5:1
 * The old field was `border-0 bg-transparent` inside a 1.3:1 tray, so in the
 * light theme it had no visible boundary at all (Founder screenshots, 4 Nov).
 *
 * Tailwind sees the literal class strings below, so keep them whole.
 */

export const COMPOSER_FIELD_BORDER_LIGHT_PERCENT = 55;
export const COMPOSER_FIELD_BORDER_DARK_PERCENT = 50;
export const COMPOSER_PLACEHOLDER_PERCENT = 70;

export function composerFieldBorderPercent(mode: "light" | "dark"): number {
  return mode === "dark"
    ? COMPOSER_FIELD_BORDER_DARK_PERCENT
    : COMPOSER_FIELD_BORDER_LIGHT_PERCENT;
}

export function composerPlaceholderPercent(): number {
  return COMPOSER_PLACEHOLDER_PERCENT;
}

export const COMPOSER_FIELD_CLASS = [
  // box: >= 44 px tall, grows with the text (the thread caps it with max-h-32)
  "max-h-32 min-h-11 w-full flex-1 resize-none rounded-control border bg-card px-3 py-2.5 text-start leading-6 shadow-none",
  // type: 16 px on the phone (no iOS zoom), 15 px on desktop
  "text-base md:text-[15px]",
  // the boundary: foreground mixed into the bar colour
  "border-[color-mix(in_oklab,var(--foreground)_55%,var(--background))]",
  "dark:border-[color-mix(in_oklab,var(--foreground)_50%,var(--background))] dark:bg-card",
  // the placeholder
  "placeholder:text-[color-mix(in_oklab,var(--foreground)_70%,var(--card))]",
  // focus
  "outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35",
  "disabled:cursor-not-allowed disabled:opacity-60",
].join(" ");
