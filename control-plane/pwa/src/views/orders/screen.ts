// W3-F4: the lazy orders screen (replaces F3's placeholder). It draws what the controller says; the app gives it a host once.
import type { ScreenModule } from "../../kit/screen-contract";
import { renderSkeleton } from "../../kit/skeleton";
import { t } from "../../i18n";
import { bindNotes } from "../notes";
import { esc } from "../view";
import { createOrdersController, type ActData, type OrdersHost } from "./controller";

let controller: ReturnType<typeof createOrdersController> | null = null;
let host: OrdersHost | null = null;
// The app calls this once the sync engine and the outbox exist (F3's app.ts does not mount lazy screens yet).
export function attachOrdersHost(h: OrdersHost | null): void { host = h; controller = h ? createOrdersController(h) : null; }

function attrs(el: Element): ActData {
  const idEl = el.closest("[data-id]"); const out: { id?: string; filter?: string; reason?: string } = {};
  const id = idEl?.getAttribute("data-id"); if (id) out.id = id;
  const f = el.getAttribute("data-filter"); if (f) out.filter = f;
  const r = el.getAttribute("data-reason"); if (r) out.reason = r;
  return out;
}

export const screen: ScreenModule = {
  // Without a host nothing is known yet: a skeleton, never an invented "no orders".
  render: (ctx) => (controller ? controller.html() : `<section class="orders" data-screen="orders"><h1>${esc(t(ctx.view.locale, "orders.title"))}</h1>${renderSkeleton({ rows: 6, label: t(ctx.view.locale, "common.loading") })}</section>`),
  bind(root) {
    const c = controller; const h = host; if (!c || !h) return () => undefined;
    const redraw = (): void => {
      root.innerHTML = c.html();
      root.querySelector<HTMLElement>("[role=dialog] button")?.focus();
    };
    const run = async (name: string, data: ActData): Promise<void> => { await c.act(name, data); redraw(); };
    const onClick = (e: Event): void => {
      const el = e.target instanceof Element ? e.target.closest("[data-act]") : null;
      if (!el || !root.contains(el) || el.hasAttribute("disabled")) return;
      void run(el.getAttribute("data-act") ?? "", attrs(el));
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") void run("sheet-cancel", {}); };
    const notes = bindNotes(root, { onDraft: (text) => { void c.act("note-draft", { text }); }, onSend: (text) => { void run("note-send", { text }); } });
    root.addEventListener("click", onClick); root.addEventListener("keydown", onKey);
    const off = h.subscribe(redraw);
    void c.refresh().then(redraw);
    return () => { root.removeEventListener("click", onClick); root.removeEventListener("keydown", onKey); notes(); off(); };
  },
};
