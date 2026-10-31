// W3b F6b: the lazy settings / devices screen (replaces F3's placeholder). It draws what the controller says; the app gives it a host once.
import type { ScreenModule } from "../../kit/screen-contract";
import { renderSkeleton } from "../../kit/skeleton";
import { t } from "../../i18n";
import { esc } from "../view";
import { createSettingsController, type ActData, type SettingsHost } from "./controller";

let controller: ReturnType<typeof createSettingsController> | null = null;
let host: SettingsHost | null = null;
export function attachSettingsHost(h: SettingsHost | null): void { host = h; controller = h ? createSettingsController(h) : null; }

function attrs(el: Element): ActData {
  const out: { id?: string; lang?: string; theme?: string } = {};
  const id = el.closest("[data-id]")?.getAttribute("data-id"); if (id) out.id = id;
  const lang = el.getAttribute("data-s-lang"); if (lang) out.lang = lang;
  const theme = el.getAttribute("data-s-theme"); if (theme) out.theme = theme;
  return out;
}

export const screen: ScreenModule = {
  // Without a host nothing is known yet: a skeleton, never an invented "all fine".
  render: (ctx) => (controller ? controller.html() : `<section class="settings" data-screen="settings" data-state="loading"><h1>${esc(t(ctx.view.locale, "settings.title"))}</h1>${renderSkeleton({ rows: 4, label: t(ctx.view.locale, "common.loading") })}</section>`),
  bind(root) {
    const c = controller; const h = host; if (!c || !h) return () => undefined;
    const redraw = (): void => { root.innerHTML = c.html(); };
    // Every act here starts with "s-": the app's own click handler on the same root answers lang, theme, retry, remove and lock-set too.
    const onClick = (e: Event): void => {
      const el = e.target instanceof Element ? e.target.closest("[data-act]") : null;
      if (!el || !root.contains(el) || el.hasAttribute("disabled")) return;
      void c.act(el.getAttribute("data-act") ?? "", attrs(el)).then(redraw, redraw);
    };
    root.addEventListener("click", onClick);
    const off = h.subscribe(redraw);
    void c.refresh().then(redraw, redraw);
    return () => { root.removeEventListener("click", onClick); off(); };
  },
};
