// The element a click on the page is FOR: the nearest data-act / data-nav / data-lang / data-theme element INSIDE root.
// closest() alone walks past root up to <html>, which carries data-theme (paint sets it): every other click then matched <html>,
// repainted the page, and a form button (reply Send, lock Save, Enter in the PIN box) lost its submit.
export const ACTION_SELECTOR = "[data-act],[data-nav],[data-lang],[data-theme]";
export function clickTarget(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>(ACTION_SELECTOR) : null;
  return el !== null && root.contains(el) ? el : null;
}
