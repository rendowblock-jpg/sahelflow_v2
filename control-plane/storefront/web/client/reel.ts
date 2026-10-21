/**
 * Reel's only script (loaded after the order-form script, product page only, under 1 KB gzipped).
 *
 * The film strip, the framing of the photo in view, the title card and the ticket are all CSS. This adds the one thing
 * CSS cannot do: on a screen with a mouse or a pen, the photo under the pointer turns a few degrees toward it, like a
 * print held under a lamp. Touch screens, reduced motion and any browser without pointer events get nothing, and nothing
 * is lost: the page is complete without this file.
 */
const MAX_DEG = 5;

function boot(): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const gallery = document.querySelector<HTMLElement>(".sf-gal");
  if (!gallery) return;

  let slide: HTMLElement | null = null;
  let x = 0;
  let y = 0;
  let frame = 0;

  function paint(): void {
    frame = 0;
    if (!slide) return;
    slide.style.setProperty("--rx", `${(x * MAX_DEG).toFixed(2)}deg`);
    slide.style.setProperty("--ry", `${(-y * MAX_DEG).toFixed(2)}deg`);
    slide.style.setProperty("--rs", "1.035");
  }

  function release(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!slide) return;
    slide.style.removeProperty("--rx");
    slide.style.removeProperty("--ry");
    slide.style.removeProperty("--rs");
    slide = null;
  }

  gallery.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const under = (event.target as Element).closest<HTMLElement>(".sf-slide");
    if (!under) return release();
    if (under !== slide) release();
    slide = under;
    const box = under.getBoundingClientRect();
    // -1 .. 1 from the centre of the photo
    x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
    y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
    if (!frame) frame = requestAnimationFrame(paint);
  });
  gallery.addEventListener("pointerleave", release);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

export {};
