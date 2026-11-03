/**
 * One source of truth for which colour preset a person sees.
 *
 * The server layout, the inline bootstrap script and the ThemeProvider all
 * decide through this file, so first paint and hydration cannot disagree.
 *
 * The preset cookie wins, then the copy in localStorage, then the default.
 * A saved name that is not in PRESETS (for example the cream notebook look that
 * was removed, which every install had saved) counts as not chosen, so that
 * install shows the default and the next save overwrites the old name.
 * The colour mode (light / dark / system) is never touched here.
 */

export const PRESETS = ["sahel", "atlas", "oasis", "dune"] as const;
export type ThemePreset = (typeof PRESETS)[number];
export const DEFAULT_PRESET: ThemePreset = "sahel";

export const PRESET_KEY = "sahelflow-theme-preset";

export function parsePreset(value: string | null | undefined): ThemePreset | null {
  return PRESETS.find((preset) => preset === value) ?? null;
}

export interface PresetInput {
  /** Value of the preset cookie, or null/undefined when absent. */
  presetCookie?: string | null;
  /** Value of the preset in localStorage, or null/undefined when absent or storage is blocked. */
  presetStorage?: string | null;
}

export function resolvePreset(input: PresetInput = {}): ThemePreset {
  return parsePreset(input.presetCookie) ?? parsePreset(input.presetStorage) ?? DEFAULT_PRESET;
}

export interface BootstrapInput {
  theme: string;
  hasThemeCookie: boolean;
  presetCookie?: string | null;
}

/**
 * The inline script that sets <html> before first paint. It repeats the rule of
 * resolvePreset in plain ES5 with the same preset list and key injected from
 * this file; preset.test.ts runs the text against the function for every table row.
 */
export function appearanceBootstrapScript(input: BootstrapInput): string {
  const json = (value: unknown) => JSON.stringify(value ?? null);
  return (
    "(function(){var P=" + json(PRESETS) +
    ",t=" + json(input.theme) +
    ",ht=" + (input.hasThemeCookie ? "true" : "false") +
    ",c=" + json(input.presetCookie) +
    ",p=" + json(DEFAULT_PRESET) +
    ",s=null;" +
    "try{if(!ht){var st=localStorage.getItem('theme');if(st==='light'||st==='dark'||st==='system')t=st;}}catch(e){}" +
    "try{s=localStorage.getItem(" + json(PRESET_KEY) + ");}catch(e){}" +
    "p=P.indexOf(c)>-1?c:(P.indexOf(s)>-1?s:p);" +
    "try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;" +
    "var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);" +
    "e.dataset.colorMode=r;e.dataset.themePreset=p;e.style.colorScheme=r;}catch(e){}})();"
  );
}
