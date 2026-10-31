// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { photoMissing, watchPhotos } from "./photos";

const SLOTS = '[data-sf="photo-missing"]';

function frameWith(imgHtml: string, frameStyle = ""): { frame: HTMLElement; img: HTMLImageElement } {
  document.body.innerHTML = `<div id="frame"${frameStyle ? ` style="${frameStyle}"` : ""}>${imgHtml}</div>`;
  const frame = document.getElementById("frame");
  const img = document.querySelector<HTMLImageElement>("img");
  if (!frame || !img) throw new Error("fixture has no frame or image");
  return { frame, img };
}
const state = (img: HTMLImageElement, complete: boolean, naturalWidth: number) => {
  Object.defineProperty(img, "complete", { value: complete, configurable: true });
  Object.defineProperty(img, "naturalWidth", { value: naturalWidth, configurable: true });
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
});

describe("a photo that fails to load (shared by the product page and the home page)", () => {
  it("becomes ONE labelled placeholder right after the image, and the broken image is hidden", () => {
    const { frame, img } = frameWith('<img src="/a.jpg" alt="Miroir mural">');
    watchPhotos();
    img.dispatchEvent(new Event("error")); // the error event does not bubble: only a capturing listener hears it
    const slot = img.nextElementSibling as HTMLElement | null;
    expect(slot?.className).toBe("sf-ph");
    expect(slot?.dataset.sf).toBe("photo-missing");
    expect(slot?.getAttribute("role")).toBe("img");
    expect(slot?.getAttribute("aria-label")).toBe("Miroir mural");
    expect(slot?.textContent).toBe("M");
    expect(slot?.hasAttribute("aria-hidden")).toBe(false);
    expect(img.dataset.broken).toBe("1");
    expect(img.style.display).toBe("none");
    expect(frame.style.position).toBe("relative");
    img.dispatchEvent(new Event("error"));
    photoMissing(img);
    expect(document.querySelectorAll(SLOTS)).toHaveLength(1);
  });

  it("keeps a frame that is already positioned as it is", () => {
    const { frame, img } = frameWith('<img src="/a.jpg" alt="x">', "position:sticky");
    watchPhotos();
    img.dispatchEvent(new Event("error"));
    expect(frame.style.position).toBe("sticky");
  });

  it("shows only the first character of the alt text, Arabic included", () => {
    const first = frameWith('<img src="/a.jpg" alt="  Ñandú table">');
    photoMissing(first.img);
    expect(first.img.nextElementSibling?.textContent).toBe("Ñ");
    const arabic = frameWith('<img src="/a.jpg" alt="ساعة حائط">');
    photoMissing(arabic.img);
    expect(arabic.img.nextElementSibling?.textContent).toBe("س");
  });

  it("hides a placeholder that has no alt text from screen readers instead of naming it", () => {
    const { img } = frameWith('<img src="/a.jpg" alt="">');
    photoMissing(img);
    const slot = img.nextElementSibling as HTMLElement | null;
    expect(slot?.dataset.sf).toBe("photo-missing");
    expect(slot?.getAttribute("aria-hidden")).toBe("true");
    expect(slot?.hasAttribute("role")).toBe(false);
    expect(slot?.hasAttribute("aria-label")).toBe(false);
    expect(slot?.textContent).toBe("");
  });

  it("leaves the sticky bar's thumbnail on its CSS surface", () => {
    const { img } = frameWith('<img class="sf-sticky-thumb" src="/a.jpg" alt="Miroir">');
    watchPhotos();
    img.dispatchEvent(new Event("error"));
    expect(document.querySelectorAll(SLOTS)).toHaveLength(0);
    expect(img.dataset.broken).toBeUndefined();
    expect(img.style.display).toBe("");
  });

  it("does nothing for an image without a parent element", () => {
    const img = document.createElement("img");
    img.alt = "x";
    expect(() => photoMissing(img)).not.toThrow();
    expect(img.dataset.broken).toBeUndefined();
  });
});

describe("images that failed BEFORE the script ran", () => {
  it("are replaced at start-up: finished loading, zero width, and a source", () => {
    const { img } = frameWith('<img src="/gone.jpg" alt="Tapis berbère">');
    state(img, true, 0);
    watchPhotos();
    expect(img.nextElementSibling?.getAttribute("data-sf")).toBe("photo-missing");
  });
  it("leave a photo that loaded alone", () => {
    const { img } = frameWith('<img src="/ok.jpg" alt="Tapis">');
    state(img, true, 640);
    watchPhotos();
    expect(document.querySelectorAll(SLOTS)).toHaveLength(0);
    expect(img.style.display).toBe("");
  });
  it("leave a photo that is still loading alone", () => {
    const { img } = frameWith('<img src="/slow.jpg" alt="Tapis">');
    state(img, false, 0);
    watchPhotos();
    expect(document.querySelectorAll(SLOTS)).toHaveLength(0);
  });
  it("leave an image with no source alone", () => {
    const { img } = frameWith('<img alt="Tapis">');
    state(img, true, 0);
    watchPhotos();
    expect(document.querySelectorAll(SLOTS)).toHaveLength(0);
  });
});

describe("the home page's own tiny script (client/home-photos.ts)", () => {
  it("starts the same watcher when it loads", async () => {
    const { img } = frameWith('<img src="/a.jpg" alt="Miroir">');
    state(img, true, 0);
    await import("./home-photos");
    expect(img.nextElementSibling?.getAttribute("data-sf")).toBe("photo-missing");
    const late = document.createElement("img");
    late.src = "/late.jpg";
    late.alt = "Late";
    img.parentElement?.append(late);
    late.dispatchEvent(new Event("error"));
    expect(late.nextElementSibling?.getAttribute("data-sf")).toBe("photo-missing");
  });
});

// A sold-out product page has no order form, so the order script (shop.ts) used to return before it ever started the photo watcher:
// a photo that failed there kept the browser's broken-image icon (seen on the fixtures' product2 pages, 31 Oct).
describe("the order script on a product page with no order form", () => {
  const failedPhoto = (extra = ""): HTMLImageElement => {
    document.body.innerHTML = `${extra}<div id="frame"><img src="/lampe.jpg" alt="Lampe en laiton"></div>`;
    const img = document.querySelector<HTMLImageElement>("img");
    if (!img) throw new Error("fixture has no image");
    state(img, true, 0);
    return img;
  };

  it("still swaps a photo that failed for the placeholder when the page has no order data at all", async () => {
    const img = failedPhoto();
    await import("./shop");
    expect(img.nextElementSibling?.getAttribute("data-sf")).toBe("photo-missing");
    expect(img.style.display).toBe("none");
  });

  it("and when it has order data but no #order form (a sold-out product)", async () => {
    const img = failedPhoto('<script id="sf-data" type="application/json">{}</script>');
    await import("./shop");
    expect(img.nextElementSibling?.getAttribute("data-sf")).toBe("photo-missing");
  });

});
