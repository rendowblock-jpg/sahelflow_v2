import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

/**
 * How the workspace looks, recorded for the NEXT native startup card.
 *
 * The startup card is painted by the desktop shell before any web page exists,
 * so it can only match the seller's language, colour mode and colour preset if
 * the workspace wrote them down. They live in cookies (the packaged app serves
 * itself from a new loopback port every launch, so `localStorage` is empty each
 * time), and the cookies are only readable here, on the server.
 *
 * The record is rewritten whenever the seller changes any of the three, and
 * once when the workspace becomes ready. It is never cleared by a launch, so a
 * crashed launch does not lose it. The desktop shell reads it with the same
 * bounds it applies to the UI-ready receipt.
 */
export const LAUNCH_APPEARANCE_FILE = "launch-appearance.json";

const LOCALES = ["ar", "fr", "en"] as const;
const THEMES = ["light", "dark", "system"] as const;
// Carnet is recorded too. The native card (src-tauri/src/launch_screen.rs) reads an unknown tag as "not chosen"
// and wears its Sahel default until it learns the Carnet colours.
const PRESETS = ["carnet", "sahel", "atlas", "oasis", "dune"] as const;

export type LaunchAppearance = {
  locale: (typeof LOCALES)[number] | null;
  theme: (typeof THEMES)[number] | null;
  preset: (typeof PRESETS)[number] | null;
};

type CookieReader = { get(name: string): { value: string } | undefined };

function pick<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

/**
 * The three values from a request's cookies. Anything that is not exactly one
 * of the known tags reads as "not chosen", never as an arbitrary string.
 */
export function readLaunchAppearance(cookies: CookieReader): LaunchAppearance {
  return {
    locale: pick(LOCALES, cookies.get("sahelflow-locale")?.value),
    theme: pick(THEMES, cookies.get("sahelflow-theme")?.value),
    preset: pick(PRESETS, cookies.get("sahelflow-theme-preset")?.value),
  };
}

function sameAppearance(path: string, next: LaunchAppearance): boolean {
  try {
    const current = JSON.parse(readFileSync(path, "utf8")) as Partial<LaunchAppearance>;
    return (
      (current.locale ?? null) === next.locale &&
      (current.theme ?? null) === next.theme &&
      (current.preset ?? null) === next.preset
    );
  } catch {
    return false;
  }
}

/**
 * Persist the record atomically. Returns false when it could not be written;
 * a failure here is never a startup or a settings failure (the card just keeps
 * its previous look).
 */
export function recordLaunchAppearance(
  dataDir: string,
  appearance: LaunchAppearance,
): boolean {
  const path = resolve(dataDir, LAUNCH_APPEARANCE_FILE);
  // Most reports repeat what is already stored; skip the disk write.
  if (sameAppearance(path, appearance)) return true;

  const temporaryPath = `${path}.tmp`;
  let handle: number | undefined;
  try {
    mkdirSync(dataDir, { recursive: true });
    handle = openSync(temporaryPath, "w", 0o600);
    writeFileSync(
      handle,
      `${JSON.stringify(
        {
          formatVersion: 1,
          ...appearance,
          updatedAtUnixSeconds: Math.floor(Date.now() / 1000),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    renameSync(temporaryPath, path);
    return true;
  } catch {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // Preserve the original persistence failure.
      }
    }
    rmSync(temporaryPath, { force: true });
    return false;
  }
}
