import type { Update } from "@tauri-apps/plugin-updater";

import type { UpdateDownloadEvent, UpdateHandle } from "./update-controller";

/**
 * The name of the desktop shell's own update check. It is the one command of
 * its own the workspace page may call (see src-tauri/permissions).
 */
export const CHECK_FOR_UPDATE_COMMAND = "check_for_update";

/**
 * The shell's own download and install. They do the plugin's work (the same
 * signed download, the same installer start) but tell the window about progress
 * a few times a second. The plugin tells it once per network chunk, and every
 * message is a script run inside the window: thousands of them during one
 * download starved the rest of the app on a slow PC.
 */
export const DOWNLOAD_UPDATE_COMMAND = "download_update";
export const INSTALL_DOWNLOADED_UPDATE_COMMAND = "install_downloaded_update";

/** What the shell sends while a download runs: the running total, a few times a second. */
type ShellDownloadMessage =
  | { event: "Progress"; data: { downloaded: number; contentLength?: number | null } }
  | { event: "Finished" };

/**
 * The offered update, as the update controller uses it. Metadata comes from the
 * plugin's resource (the shell stored the update there); download and install go
 * through the shell's own commands.
 */
class DesktopUpdate implements UpdateHandle {
  private downloadedRid: number | null = null;

  constructor(private readonly resource: Update) {}

  get version(): string {
    return this.resource.version;
  }

  get date(): string | undefined {
    return this.resource.date;
  }

  get body(): string | undefined {
    return this.resource.body;
  }

  async download(onEvent?: (event: UpdateDownloadEvent) => void): Promise<void> {
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<ShellDownloadMessage>();
    let started = false;
    let seen = 0;
    channel.onmessage = (message) => {
      if (!onEvent) return;
      if (message.event === "Finished") {
        onEvent({ event: "Finished" });
        return;
      }
      if (!started) {
        started = true;
        onEvent({ event: "Started", data: { contentLength: message.data.contentLength ?? undefined } });
      }
      // The controller adds chunk lengths up, so hand it the difference.
      const chunkLength = message.data.downloaded - seen;
      if (chunkLength > 0) {
        seen = message.data.downloaded;
        onEvent({ event: "Progress", data: { chunkLength } });
      }
    };
    this.downloadedRid = await invoke<number>(DOWNLOAD_UPDATE_COMMAND, {
      rid: this.resource.rid,
      onEvent: channel,
    });
  }

  async install(): Promise<void> {
    if (this.downloadedRid === null) {
      throw new Error("The update was installed before it was downloaded.");
    }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke(INSTALL_DOWNLOADED_UPDATE_COMMAND, {
      rid: this.resource.rid,
      bytesRid: this.downloadedRid,
    });
    // Only after it worked: a failed install keeps the bytes, so Retry can try again.
    this.downloadedRid = null;
  }

  async close(): Promise<void> {
    await this.resource.close();
  }
}

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
 * offered update, or `null` when SahelFlow is up to date.
 *
 * The plugin's own `check()` is deliberately not used. It builds every update
 * with the plugin's default exit hook, which does not stop the contained
 * servers before the Windows installer starts. The shell builds each update
 * with its own hook and stores it where the plugin's download and install
 * commands expect it, so `Update` works on it exactly as before.
 *
 * The imports are dynamic: both packages only work inside the desktop app.
 */
export async function checkForDesktopUpdate(): Promise<UpdateHandle | null> {
  const [{ invoke }, { Update: UpdateResource }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/plugin-updater"),
  ]);
  const offer = await invoke<unknown>(CHECK_FOR_UPDATE_COMMAND);
  if (offer === null || offer === undefined) return null;
  if (!isOffer(offer)) {
    throw new Error("The update check returned an answer SahelFlow could not read.");
  }
  return new DesktopUpdate(
    new UpdateResource({
      rid: offer.rid,
      currentVersion: offer.currentVersion,
      version: offer.version,
      date: offer.date ?? undefined,
      body: offer.body ?? undefined,
      rawJson: offer.rawJson ?? {},
    }),
  );
}
