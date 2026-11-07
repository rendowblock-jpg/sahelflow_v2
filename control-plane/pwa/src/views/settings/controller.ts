// W3b F6b: what the settings screen does. The host (app/settings-host.ts) holds the data; this holds only the remove-this-phone dialog.
import { isLocale, type Locale } from "../../i18n";
import { LOOKS, type Look } from "../../look";
import type { Theme } from "../view";
import { renderSettings, type SettingsRead } from "./render";

export type SettingsHost = Readonly<{
  now(): number; locale(): Locale; online(): boolean; timeZone?: string; theme(): Theme; look(): Look; hasLock(): boolean;
  read(): SettingsRead;
  reload(): Promise<void>;
  retry(commandId: string): Promise<void>;
  discard(commandId: string): Promise<void>;
  setLocale(l: Locale): void;
  setTheme(x: Theme): void;
  setLook(x: Look): void;
  startLockSetup(): void;
  /** Wipes everything on this phone. Works offline. True when every step worked. */
  remove(): Promise<boolean>;
  subscribe(fn: () => void): () => void;
}>;
export type ActData = Readonly<{ id?: string; lang?: string; theme?: string; look?: string }>;

export function createSettingsController(host: SettingsHost) {
  const ui = { confirmRemove: false, removeError: false, removed: false };
  const html = (): string => renderSettings({
    locale: host.locale(), theme: host.theme(), look: host.look(), online: host.online(), ...(host.timeZone ? { timeZone: host.timeZone } : {}),
    hasLock: host.hasLock(), read: host.read(), ...ui,
  });
  async function act(name: string, d: ActData): Promise<void> {
    switch (name) {
      case "s-lang": if (isLocale(d.lang ?? null)) host.setLocale(d.lang as Locale); return;
      case "s-theme": if (d.theme === "light" || d.theme === "dark" || d.theme === "system") host.setTheme(d.theme); return;
      case "s-look": { const x = LOOKS.find((l) => l === d.look); if (x) host.setLook(x); return; }
      case "s-lock-set": host.startLockSetup(); return;
      case "s-reload": await host.reload(); return;
      case "s-retry": if (d.id) await host.retry(d.id); return;
      case "s-discard": if (d.id) await host.discard(d.id); return;
      case "s-remove": ui.confirmRemove = true; ui.removeError = false; return;
      case "s-remove-no": ui.confirmRemove = false; return;
      case "s-remove-yes": {
        ui.confirmRemove = false;
        const ok = await host.remove().catch(() => false);
        ui.removed = ok; ui.removeError = !ok;
        return;
      }
      default: return;
    }
  }
  return { html, act, refresh: () => host.reload() };
}
