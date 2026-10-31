// W3-F5: the redraw glue. A redraw by innerHTML loses the focus; the focused control is found again by its data-key.
export type FocusState = Readonly<{ key: string; start: number; end: number }>;
type Caret = Readonly<{ selectionStart: number | null; selectionEnd: number | null }>;
type Keyed = Readonly<{ getAttribute(name: string): string | null }>;
type Focusable = Readonly<{ focus(): void; setSelectionRange?(start: number, end: number): void }>;

export function focusKeyOf(el: Keyed | null, caret: Caret | null): FocusState | null {
  const key = el?.getAttribute("data-key"); if (!key) return null;
  return { key, start: caret?.selectionStart ?? -1, end: caret?.selectionEnd ?? -1 };
}
export function restoreFocus(root: Readonly<{ querySelector(selector: string): Focusable | null }>, s: FocusState | null): void {
  if (!s) return;
  const el = root.querySelector(`[data-key="${s.key.replace(/["\\]/g, "\\$&")}"]`); if (!el) return;
  el.focus();
  if (s.start >= 0 && typeof el.setSelectionRange === "function") { try { el.setSelectionRange(s.start, s.end); } catch { /* a button has no caret */ } }
}
