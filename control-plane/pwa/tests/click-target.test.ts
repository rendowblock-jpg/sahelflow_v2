// @vitest-environment happy-dom
// Found in the PWA lab (real Chromium, 31 Oct 2026): paint() sets <html data-theme="light|dark">, and the app's root click handler used
// target.closest("[data-act],[data-nav],[data-lang],[data-theme]") with no limit, so a click on anything WITHOUT a data-act (the reply
// "Send" button, the lock "Save the code" button, Enter in the PIN box = a synthetic click on that button) matched <html>: the handler
// repainted the whole page, the form was disconnected before it could submit ("Form submission canceled because the form is not
// connected"), the reply and the PIN were lost, and sf.theme was silently saved. This pins the decision on a real DOM.
// Since the look picker (7 Nov 2026) paint() also sets <html data-look="sahel|atlas|oasis|dune"> and ACTION_SELECTOR names [data-look]:
// the same rule must hold for it, so <html> carries both attributes in every test below.
import { beforeEach, describe, expect, it } from "vitest";
import { clickTarget } from "../src/app/click-target";

let root: HTMLElement;
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
beforeEach(() => {
  document.documentElement.dataset.theme = "light";
  document.documentElement.dataset.look = "sahel";
  document.body.innerHTML = `<div id="app"><main id="main"><form data-form="lock"><input id="pin"><button type="submit" id="save">Save the code</button></form>
    <form data-form="composer" data-mode="reply"><textarea id="box"></textarea><button type="submit" id="send" data-key="act:send">Send</button></form>
    <button data-act="s-remove" id="rm"><span id="inner">Remove</span></button><a data-nav="orders" id="nav">Orders</a><button data-lang="fr" id="fr">FR</button><button data-theme="dark" id="th">Dark</button><button data-look="atlas" id="lk"><span id="lkin">Atlas</span></button><p id="text">plain text</p></main></div>`;
  root = $("app");
});

describe("clickTarget: which element a click is for", () => {
  it("a form button without a data-act is for nobody (never <html>, which carries data-theme and data-look)", () => {
    expect(clickTarget($("save"), root)).toBeNull(); expect(clickTarget($("send"), root)).toBeNull();
    expect(clickTarget($("pin"), root)).toBeNull(); expect(clickTarget($("box"), root)).toBeNull(); expect(clickTarget($("text"), root)).toBeNull();
  });
  it("an element inside a data-act / data-nav / data-lang / data-theme / data-look element is for that element", () => {
    expect(clickTarget($("lk"), root)).toBe($("lk")); expect(clickTarget($("lkin"), root)).toBe($("lk"));
    expect(clickTarget($("inner"), root)).toBe($("rm")); expect(clickTarget($("rm"), root)).toBe($("rm"));
    expect(clickTarget($("nav"), root)).toBe($("nav")); expect(clickTarget($("fr"), root)).toBe($("fr")); expect(clickTarget($("th"), root)).toBe($("th"));
  });
  it("a click that is not on an element (null, a text node, the document) is for nobody", () => {
    expect(clickTarget(null, root)).toBeNull(); expect(clickTarget(document, root)).toBeNull(); expect(clickTarget(($("text").firstChild as Node), root)).toBeNull();
  });
  it("<html> itself is never the target, whichever of its two attributes the selector matches", () => {
    expect(document.documentElement.matches("[data-theme]") && document.documentElement.matches("[data-look]")).toBe(true);
    expect(clickTarget(document.documentElement, root)).toBeNull(); expect(clickTarget(document.body, root)).toBeNull();
  });
  it("through a real listener: Send and Save do nothing, a data-act button still acts", () => {
    let hits = 0; root.addEventListener("click", (e) => { if (clickTarget(e.target, root)) hits += 1; });
    $("send").click(); $("save").click(); $("text").click(); expect(hits).toBe(0);
    $("rm").click(); expect(hits).toBe(1); $("inner").click(); expect(hits).toBe(2);
  });
});
