/**
 * Escape clears a typed settings query before it may close the window.
 * Returns true when the event was consumed.
 *
 * Radix Dialog listens for Escape on document capture, so a bubble or
 * target-phase handler on the field runs too late. Callers attach this in
 * the capture phase ahead of that listener (window capture) and again on
 * the field itself.
 */
export function consumeSettingsSearchEscape(
  event: { key: string; preventDefault: () => void; stopPropagation: () => void },
  query: string,
  clear: () => void,
): boolean {
  if (event.key !== "Escape" || !query) return false;
  event.preventDefault();
  event.stopPropagation();
  clear();
  return true;
}

/** Window capture runs before Radix Dialog's document-capture Escape listener. */
export function bindSettingsSearchEscape(
  field: HTMLInputElement,
  clear: () => void,
): () => void {
  const onSearchEscape = (event: KeyboardEvent) => {
    if (event.target !== field) return;
    consumeSettingsSearchEscape(event, field.value, clear);
  };
  window.addEventListener("keydown", onSearchEscape, { capture: true });
  return () => {
    window.removeEventListener("keydown", onSearchEscape, { capture: true });
  };
}
