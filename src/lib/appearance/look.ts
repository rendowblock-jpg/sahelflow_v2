/**
 * One source of truth for which colour preset a person sees.
 *
 * The server layout, the inline bootstrap script and the ThemeProvider all
 * decide through this file, so first paint and hydration cannot disagree.
 *
 * One-time look migration (marker `sahelflow-look` = "2"): the provider stores
 * the default preset as if it were a choice, so every install already has a
 * preset saved. Without the marker the person has never been shown the Carnet
 * look, so they get Carnet and the marker is written together with the preset.
 * With the marker, the saved valid preset is respected. The colour mode
 * (light / dark / system) is never touched here.
 */

/** Display order: Carnet is first. */
export const PRESETS = ["carnet", "sahel", "atlas", "oasis", "dune"] as const;
export type ThemePreset = (typeof PRESETS)[number];
export const DEFAULT_PRESET: ThemePreset = "carnet";

export const PRESET_KEY = "sahelflow-theme-preset";
export const LOOK_KEY = "sahelflow-look";
export const LOOK_VERSION = "2";

export function parsePreset(value: string | null | undefined): ThemePreset | null {
  return PRESETS.find((preset) => preset === value) ?? null;
}

export interface LookInput {
  /** Value of the preset cookie, or null/undefined when absent. */
  presetCookie?: string | null;
  /** Value of the preset in localStorage, or null/undefined when absent or storage is blocked. */
  presetStorage?: string | null;
  lookCookie?: string | null;
  lookStorage?: string | null;
}

export interface LookDecision {
  preset: ThemePreset;
  /** True when the preset and the marker still have to be written (migration or first run). */
  write: boolean;
}

export function resolveLook(input: LookInput = {}): LookDecision {
  const marked = input.lookCookie === LOOK_VERSION || input.lookStorage === LOOK_VERSION;
  if (!marked) return { preset: DEFAULT_PRESET, write: true };
  return {
    preset: parsePreset(input.presetCookie) ?? parsePreset(input.presetStorage) ?? DEFAULT_PRESET,
    write: false,
  };
}

export interface BootstrapInput {
  theme: string;
  hasThemeCookie: boolean;
  presetCookie?: string | null;
  lookCookie?: string | null;
}

/**
 * The inline script that sets <html> before first paint. It repeats the rule of
 * resolveLook in plain ES5 with the same preset list and keys injected from
 * this file; look.test.ts runs the text against the function for every table row.
 */
export function appearanceBootstrapScript(input: BootstrapInput): string {
  const json = (value: unknown) => JSON.stringify(value ?? null);
  return (
    "(function(){var P=" + json(PRESETS) +
    ",V=" + json(LOOK_VERSION) +
    ",t=" + json(input.theme) +
    ",ht=" + (input.hasThemeCookie ? "true" : "false") +
    ",c=" + json(input.presetCookie) +
    ",mk=" + json(input.lookCookie) +
    ",p=" + json(DEFAULT_PRESET) +
    ",s=null,ms=null;" +
    "try{if(!ht){var st=localStorage.getItem('theme');if(st==='light'||st==='dark'||st==='system')t=st;}}catch(e){}" +
    "try{s=localStorage.getItem(" + json(PRESET_KEY) + ");ms=localStorage.getItem(" + json(LOOK_KEY) + ");}catch(e){}" +
    "if(mk===V||ms===V){p=P.indexOf(c)>-1?c:(P.indexOf(s)>-1?s:p);}" +
    "try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;" +
    "var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);" +
    "e.dataset.colorMode=r;e.dataset.themePreset=p;e.style.colorScheme=r;}catch(e){}})();"
  );
}
