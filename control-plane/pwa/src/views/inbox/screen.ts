// W3-F5: the lazy inbox screen (replaces F3's placeholder). It draws what the controller says; the app gives it a host once.
import type { ScreenModule } from "../../kit/screen-contract";
import { renderSkeleton } from "../../kit/skeleton";
import { t } from "../../i18n";
import { bindNotes } from "../notes";
import { esc } from "../view";
import { createInboxController, type ActData, type InboxHost } from "./controller";
import { focusKeyOf, restoreFocus } from "./glue";

let controller: ReturnType<typeof createInboxController> | null = null;
let host: InboxHost | null = null;
// The app calls this once the sync engine and the outbox exist (the lead binds enqueueReply to the outbox).
export function attachInboxHost(h: InboxHost | null): void { host = h; controller = h ? createInboxController(h) : null; }

function attrs(el: Element): ActData {
  const idEl = el.closest("[data-id]"); const id = idEl?.getAttribute("data-id");
  return id ? { id } : {};
}
const isReplyArea = (el: Element | null): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement && el.name === "text" && el.closest("[data-form=composer][data-mode=reply]") !== null;

export const screen: ScreenModule = {
  // Without a host nothing is known yet: a skeleton, never an invented "no conversations".
  render: (ctx) => (controller ? controller.html() : `<section class="inbox" data-screen="inbox"><h1>${esc(t(ctx.view.locale, "inbox.title"))}</h1>${renderSkeleton({ rows: 8, label: t(ctx.view.locale, "common.loading") })}</section>`),
  bind(root) {
    const c = controller; const h = host; if (!c || !h) return () => undefined;
    const redraw = (): void => {
      const active = root.ownerDocument.activeElement;
      const saved = active && root.contains(active) ? focusKeyOf(active, active as unknown as { selectionStart: number | null; selectionEnd: number | null }) : null;
      root.innerHTML = c.html();
      restoreFocus({ querySelector: (s) => root.querySelector<HTMLElement>(s) }, saved);
    };
    const run = async (name: string, data: ActData): Promise<void> => { await c.act(name, data); redraw(); };
    const onClick = (e: Event): void => {
      const el = e.target instanceof Element ? e.target.closest("[data-act]") : null;
      if (!el || !root.contains(el) || el.hasAttribute("disabled")) return;
      void run(el.getAttribute("data-act") ?? "", attrs(el));
    };
    // The typed reply is kept in the controller at once (and in the draft store), so a redraw never loses it.
    const onInput = (e: Event): void => { const el = e.target instanceof Element ? e.target : null; if (isReplyArea(el)) void c.act("reply-draft", { text: el.value }); };
    const onSubmit = (e: Event): void => {
      const form = e.target; if (!(form instanceof HTMLFormElement) || form.dataset.form !== "composer" || form.dataset.mode !== "reply") return;
      e.preventDefault(); void run("reply-send", { text: form.querySelector("textarea")?.value ?? "" });
    };
    const notes = bindNotes(root, { onDraft: (text) => { void c.act("note-draft", { text }); }, onSend: (text) => { void run("note-send", { text }); } });
    root.addEventListener("click", onClick); root.addEventListener("input", onInput); root.addEventListener("submit", onSubmit);
    const off = h.subscribe(() => { void c.refreshCommands().then(redraw); });
    void c.refresh().then(redraw);
    return () => { root.removeEventListener("click", onClick); root.removeEventListener("input", onInput); root.removeEventListener("submit", onSubmit); notes(); off(); };
  },
};
