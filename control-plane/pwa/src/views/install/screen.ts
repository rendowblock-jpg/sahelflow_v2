// W3b F6a: the install screen. Static (no network), so it works offline. The state comes from the pure detector in install-state.ts.
import type { ScreenCtx, ScreenModule } from "../../kit/screen-contract";
import { t } from "../../i18n";
import { esc } from "../view";
import { installState, type InstallEnv } from "./install-state";

const envOf = (c: ScreenCtx): InstallEnv => {
  const n = typeof navigator === "undefined" ? null : navigator;
  return { ua: n?.userAgent ?? "", platform: n?.platform ?? "", maxTouchPoints: n?.maxTouchPoints ?? 0, standalone: c.view.installed, canPrompt: c.view.canInstall };
};
export function renderInstall(c: ScreenCtx, env: InstallEnv = envOf(c)): string {
  const tr = (k: string): string => esc(t(c.view.locale, k));
  const s = installState(env);
  if (s === "installed") return "";
  const head = `<section class="install" data-screen="install" data-state="${s}"><h1>${tr(`install.${s}.title`)}</h1>`;
  if (s === "ios") return `${head}<ol class="install-steps"><li>${tr("install.ios.step1")}</li><li>${tr("install.ios.step2")}</li><li>${tr("install.ios.step3")}</li></ol></section>`;
  if (s === "android") return `${head}<p class="lead">${tr("install.android.body")}</p><div class="actions"><button type="button" class="btn" data-act="install">${tr("install.android.button")}</button></div></section>`;
  if (s === "inapp") return `${head}<p class="lead">${tr("install.inapp.body")}</p><div class="actions"><button type="button" class="btn" data-install="copy">${tr("install.inapp.copy")}</button></div><p class="hint" role="status" aria-live="polite" data-copy-status></p></section>`;
  return `${head}<p class="lead">${tr("install.unsupported.body")}</p></section>`;
}
export const screen: ScreenModule = {
  render: (c) => renderInstall(c),
  // The install button (data-act="install") is handled by the app's own click handler; only "copy link" lives here.
  bind(root, c) {
    const say = (k: string): void => { const el = root.querySelector("[data-copy-status]"); if (el) el.textContent = t(c.view.locale, k); };
    const onClick = (e: Event): void => {
      if (!(e.target as Element | null)?.closest?.("[data-install=copy]")) return;
      const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (!clip || typeof location === "undefined") { say("install.inapp.failed"); return; }
      void clip.writeText(`${location.origin}/`).then(() => say("install.inapp.copied"), () => say("install.inapp.failed"));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  },
};
