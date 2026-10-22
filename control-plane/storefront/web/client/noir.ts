/**
 * Noir's script (loaded on every page of the style, under 1 KB gzipped).
 *
 * The stage of a Noir page is lit by a spotlight. Without this file the light rests above the product; with a mouse or a pen
 * it follows the pointer. Touch screens, reduced motion and any browser without pointer events keep the resting light, and
 * nothing is lost: the page is complete without this file.
 */
function boot(): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const stage = document.querySelector<HTMLElement>(".nx-stage, .nx-cover");
  if (!stage) return;
  let frame = 0;
  let x = 50;
  let y = 34;
  const paint = (): void => {
    frame = 0;
    stage.style.setProperty("--mx", `${x.toFixed(1)}%`);
    stage.style.setProperty("--my", `${y.toFixed(1)}%`);
  };
  stage.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const box = stage.getBoundingClientRect();
    x = Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100));
    y = Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100));
    if (!frame) frame = requestAnimationFrame(paint);
  });
  stage.addEventListener("pointerleave", () => {
    x = 50;
    y = 34;
    if (!frame) frame = requestAnimationFrame(paint);
  });
}

boot();

export {};
