/**
 * A photo that fails to load becomes a placeholder element that carries the alt text: the browser's broken-image icon is
 * not ours, and a DOM probe cannot see an img::before surface. The product page script and the home page's own tiny
 * script (home-photos.ts) both call watchPhotos. The sticky bar's thumbnail keeps its CSS surface.
 */
export function photoMissing(img: HTMLImageElement): void {
  const frame = img.parentElement;
  if (img.dataset.broken || !frame || img.classList.contains("sf-sticky-thumb")) return;
  img.dataset.broken = "1";
  img.style.display = "none";
  if (!["relative", "absolute", "fixed", "sticky"].includes(getComputedStyle(frame).position)) frame.style.position = "relative";
  const slot = document.createElement("span");
  slot.className = "sf-ph";
  slot.dataset.sf = "photo-missing";
  if (img.alt) {
    slot.setAttribute("role", "img");
    slot.setAttribute("aria-label", img.alt);
    slot.textContent = Array.from(img.alt.trim())[0] ?? "";
  } else slot.setAttribute("aria-hidden", "true");
  img.after(slot);
}

/** Catches photos that fail from now on (the error event does not bubble: capture it) and those that failed before this script ran. */
export function watchPhotos(): void {
  document.addEventListener("error", (event) => { if (event.target instanceof HTMLImageElement) photoMissing(event.target); }, true);
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>("img"))) if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) photoMissing(img);
}
