"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { Download, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { isTauriEnv } from "@/lib/env";

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

const UPDATER_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const UPDATER_CURRENT_POLL_INTERVAL_MS = 30 * 60_000;

function isUpdaterAccessFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:permissions associated with this command|(?:plugin:)?(?:updater|process)[.:|][\w-]+\s+not allowed|(?:capabilit|acl).*(?:denied|forbidden|not allowed)|(?:denied|forbidden|not allowed).*(?:capabilit|acl)|(?:ipc|invoke).*(?:denied|forbidden|not allowed))/i.test(
    message,
  );
}

function isUpdaterTransientFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:offline|network|timed?\s*out|timeout|connection|connect(?:ion)?\s+(?:refused|reset|closed)|dns|name resolution|temporar(?:y|ily)|failed to fetch|error sending request|wsaeacces|os error 10013|socket.*access permissions|http(?:\s+status)?\s+(?:408|429|5\d\d)\b)/i.test(
    message,
  );
}

/**
 * Updater component — checks for app updates on launch (Tauri desktop only).
 *
 * In non-Tauri contexts (browser dev), this renders nothing.
 * In Tauri, it:
 *   1. Checks on mount and continues polling while the app remains open
 *   2. Opens a release-notes dialog when a signed update is available
 *   3. Re-offers deferred updates and surfaces permanent/bounded-retry failures
 *   4. Downloads + installs the update, then prompts to restart
 *
 * The updater uses the Tauri updater plugin (tauri-plugin-updater) which
 * verifies the update signature against the pubkey in tauri.conf.json.
 * Updates are hosted on GitHub Releases.
 */
export function UpdateChecker() {
  const { t, locale } = useI18n();
  const [isTauri, setIsTauri] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    // Detect Tauri environment (T-S1: __TAURI_INTERNALS__ not __TAURI__)
    if (isTauriEnv()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTauri(true);
    }
  }, []);

  // Check on mount and retain bounded recovery/polling for the whole session.
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      let retryIndex = 0;

      while (!cancelled) {
        let nextCheckDelay = UPDATER_CURRENT_POLL_INTERVAL_MS;
        try {
          // Dynamic import — only available in Tauri context
          const { check } = await import("@tauri-apps/plugin-updater");
          const update = await check();
          if (cancelled) return;

          if (!update) {
            retryIndex = 0;
          } else {
            setUpdateAvailable({
              version: update.version,
              date: update.date,
              body: update.body,
            });
            setDialogOpen(true);
            // Keep the loop alive. If the seller defers or closes the dialog,
            // the same signed update is offered again at the normal interval.
            retryIndex = 0;
          }
        } catch (err) {
          if (cancelled) return;
          const description =
            err instanceof Error ? err.message : t("updater.unknownError");
          const transientFailure = isUpdaterTransientFailure(err);

          // A broken desktop capability cannot recover within this binary.
          // Transport classification runs first because Windows socket denials
          // can mention access permissions without being Tauri ACL failures.
          if (!transientFailure && isUpdaterAccessFailure(err)) {
            toast.error(t("updater.checkFailed"), {
              description,
            });
            console.warn("[updater] access check failed:", err);
            return;
          }

          const shouldRetrySilently =
            transientFailure && retryIndex < UPDATER_RETRY_DELAYS_MS.length;
          if (shouldRetrySilently) {
            nextCheckDelay =
              UPDATER_RETRY_DELAYS_MS[retryIndex] ??
              UPDATER_CURRENT_POLL_INTERVAL_MS;
            retryIndex += 1;
            console.warn(
              "[updater] transient check failed; retry scheduled:",
              err,
            );
          } else {
            // Permanent feed/manifest failures surface immediately. Transient
            // failures surface after the bounded 1/5/15-minute retry budget.
            // Periodic polling remains alive so a repaired feed can recover
            // without requiring an application restart.
            toast.error(t("updater.checkFailed"), { description });
            console.error(
              "[updater] check failed; periodic recovery retained:",
              err,
            );
            retryIndex = 0;
          }
        }

        await new Promise<void>((resolve) => {
          retryTimer = setTimeout(resolve, nextCheckDelay);
        });
        retryTimer = undefined;
      }
    })();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [isTauri, t]);

  async function downloadAndInstall(): Promise<void> {
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");

      const update = await check();
      if (!update) {
        toast.info(t("updater.noLongerAvailable"));
        setDialogOpen(false);
        return;
      }

      let totalContentLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalContentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (totalContentLength > 0) {
              setDownloadProgress(Math.round((downloaded / totalContentLength) * 100));
            }
            break;
          case "Finished":
            setDownloadProgress(100);
            break;
        }
      });

      toast.success(t("updater.installed"), {
        description: t("updater.restarting"),
      });

      // Relaunch the app after a short delay so the user sees the toast
      setTimeout(() => {
        void relaunch();
      }, 1500);
    } catch (err) {
      toast.error(t("updater.installFailed"), {
        description: err instanceof Error ? err.message : t("updater.unknownError"),
      });
    } finally {
      setDownloading(false);
    }
  }

  // Non-Tauri: render nothing
  if (!isTauri) return null;

  return (
    <>
      {/* Update available dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !downloading && setDialogOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("updater.available")}
            </DialogTitle>
            <DialogDescription>
              {t("updater.availableDesc")}
            </DialogDescription>
          </DialogHeader>

          {updateAvailable && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">v{updateAvailable.version}</Badge>
                {updateAvailable.date && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(updateAvailable.date).toLocaleDateString(locale === "ar" ? "ar" : locale === "en" ? "en-US" : "fr-FR")}
                  </span>
                )}
              </div>

              {updateAvailable.body && (
                <div className="rounded-md bg-muted/50 p-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs whitespace-pre-wrap font-sans">
                    {updateAvailable.body}
                  </pre>
                </div>
              )}

              {downloading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("updater.downloading")}</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={downloading}
            >
              {t("updater.later")}
            </Button>
            <Button onClick={downloadAndInstall} disabled={downloading}>
              {downloading ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 me-2" />
              )}
              {downloading ? t("updater.installing") : t("updater.downloadInstall")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact status indicator for the settings page (shows "up to date"). */
export function UpdaterStatus() {
  const { t } = useI18n();
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    if (isTauriEnv()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTauri(true);
    }
  }, []);

  if (!isTauri) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("updater.webMode")}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5 text-success">
      <CheckCircle2 className="h-3 w-3" />
      {t("updater.autoUpdateEnabled")}
    </Badge>
  );
}
