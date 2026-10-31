// W3b F6c: draws a lazy screen (orders, inbox, devices, install) into <main>. Skeleton at once, then render + bind; ONE disposer;
// a failed load or a throwing screen is the error block with Retry (never a blank page); an answer for a screen already left is ignored.
import { t } from "../i18n";
import { renderError } from "../kit/error-block";
import { restoreFocus } from "../kit/focus";
import type { ScreenCtx, ScreenModule } from "../kit/screen-contract";
import { renderSkeleton } from "../kit/skeleton";
import type { ScreenId } from "../views/view";
import { GROUP_OF, type ScreenGroup } from "./registry";

export type ScreenMountDeps = Readonly<{ load(group: ScreenGroup): Promise<ScreenModule>; ctx(): ScreenCtx; root(): HTMLElement | null }>;
export type ScreenMount = Readonly<{ show(screen: ScreenId, focusKey?: string | null): void; dispose(): void }>;

export function createScreenMount(deps: ScreenMountDeps): ScreenMount {
  const loaded = new Map<ScreenGroup, ScreenModule>();
  let off: (() => void) | null = null; let offRetry: (() => void) | null = null; let ticket = 0;
  const release = (): void => { const a = off; const b = offRetry; off = null; offRetry = null; try { a?.(); } finally { b?.(); } };

  const fail = (main: HTMLElement, screen: ScreenId, focusKey: string | null): void => {
    const L = deps.ctx().view.locale;
    main.innerHTML = renderError({ title: t(L, "common.error.title"), body: t(L, "screen.error.body"), retryAct: "screen-retry", retryLabel: t(L, "common.retry") });
    const onClick = (e: Event): void => { if (e.target instanceof Element && e.target.closest("[data-act=screen-retry]")) show(screen, focusKey); };
    main.addEventListener("click", onClick); offRetry = () => main.removeEventListener("click", onClick);
  };
  const draw = (main: HTMLElement, mod: ScreenModule, screen: ScreenId, focusKey: string | null): void => {
    try { const c = deps.ctx(); main.innerHTML = mod.render(c); off = mod.bind(main, c); restoreFocus(main, focusKey); }
    catch { release(); fail(main, screen, focusKey); }
  };
  function show(screen: ScreenId, focusKey: string | null = null): void {
    release(); const mine = ++ticket;
    const group = GROUP_OF[screen]; const main = deps.root();
    if (!group || !main) return;
    const have = loaded.get(group);
    if (have) { draw(main, have, screen, focusKey); return; }
    main.innerHTML = renderSkeleton({ rows: 6, label: t(deps.ctx().view.locale, "common.loading") });
    void Promise.resolve().then(() => deps.load(group)).then(
      (mod) => { loaded.set(group, mod); const now = deps.root(); if (mine === ticket && now) draw(now, mod, screen, focusKey); },
      () => { const now = deps.root(); if (mine === ticket && now) fail(now, screen, focusKey); },
    );
  }
  return { show, dispose: () => { release(); ticket++; } };
}
