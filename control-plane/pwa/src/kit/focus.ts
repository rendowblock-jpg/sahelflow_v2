// A redraw by innerHTML loses the focus. The focused control is remembered by its data-key and found again in the new HTML.
export function focusKeyOf(active: Element | null, within: HTMLElement): string | null {
  if (!active || !within.contains(active)) return null;
  const holder = active.closest("[data-key]");
  return holder && within.contains(holder) ? holder.getAttribute("data-key") : null;
}

export function restoreFocus(within: HTMLElement, key: string | null): boolean {
  if (!key) return false;
  const el = Array.from(within.querySelectorAll<HTMLElement>("[data-key]")).find((e) => e.getAttribute("data-key") === key);
  if (!el) return false;
  el.focus();
  return true;
}
