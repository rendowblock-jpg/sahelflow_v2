import type { Update } from "@tauri-apps/plugin-updater";

/**
 * The name of the desktop shell's own update check. It is the one command of
 * its own the workspace page may call (see src-tauri/permissions).
 */
export const CHECK_FOR_UPDATE_COMMAND = "check_for_update";

/** What the desktop shell answers when an update exists. */
interface DesktopUpdateOffer {
  rid: number;
  currentVersion: string;
  version: string;
  date?: string | null;
  body?: string | null;
  rawJson?: Record<string, unknown> | null;
}

function isOffer(value: unknown): value is DesktopUpdateOffer {
  if (typeof value !== "object" || value === null) return false;
  const offer = value as Partial<DesktopUpdateOffer>;
  return (
    typeof offer.rid === "number" &&
    typeof offer.version === "string" &&
    typeof offer.currentVersion === "string"
  );
}

/**
 * Looks for a signed update through the desktop shell and resolves to the
 * updater plugin's `Update`, or `null` when SahelFlow is up to date.
 *
 * The plugin's own `check()` is deliberately not used. It builds every update
 * with the plugin's default exit hook, which does not stop the contained
 * servers before the Windows installer starts. The shell builds each update
 * with its own hook and stores it where the plugin's download and install
 * commands expect it, so `Update` works on it exactly as before.
 *
 * The imports are dynamic: both packages only work inside the desktop app.
 */
export async function checkForDesktopUpdate(): Promise<Update | null> {
  const [{ invoke }, { Update: UpdateResource }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/plugin-updater"),
  ]);
  const offer = await invoke<unknown>(CHECK_FOR_UPDATE_COMMAND);
  if (offer === null || offer === undefined) return null;
  if (!isOffer(offer)) {
    throw new Error("The update check returned an answer SahelFlow could not read.");
  }
  return new UpdateResource({
    rid: offer.rid,
    currentVersion: offer.currentVersion,
    version: offer.version,
    date: offer.date ?? undefined,
    body: offer.body ?? undefined,
    rawJson: offer.rawJson ?? {},
  });
}
