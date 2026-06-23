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
import { toast } from "sonner";
import { Download, RefreshCw, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

/**
 * Updater component — checks for app updates on launch (Tauri desktop only).
 *
 * In non-Tauri contexts (browser dev), this renders nothing.
 * In Tauri, it:
 *   1. Checks for updates on mount (silently — no UI if no update)
 *   2. If an update is available, shows a toast with a "Télécharger" button
 *   3. When the user clicks, shows a dialog with release notes + install button
 *   4. Downloads + installs the update, then prompts to restart
 *
 * The updater uses the Tauri updater plugin (tauri-plugin-updater) which
 * verifies the update signature against the pubkey in tauri.conf.json.
 * Updates are hosted on GitHub Releases.
 */
export function UpdateChecker() {
  const { t, locale } = useI18n();
  const [isTauri, setIsTauri] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    // Detect Tauri environment
    if (typeof window !== "undefined" && "__TAURI__" in window) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTauri(true);
    }
  }, []);

  // Check for updates on mount (Tauri only)
  useEffect(() => {
    if (!isTauri) return;
    void checkForUpdates(false); // silent on first check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri]);

  async function checkForUpdates(showToast: boolean): Promise<void> {
    setChecking(true);
    try {
      // Dynamic import — only available in Tauri context
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (update) {
        setUpdateAvailable({
          version: update.version,
          date: update.date,
          body: update.body,
        });
        setDialogOpen(true);
      } else if (showToast) {
        toast.success(t("updater.upToDate"), {
          description: t("updater.upToDateDesc"),
        });
      }
    } catch (err) {
      // Silently fail on auto-check; show error only on manual check
      if (showToast) {
        toast.error(t("updater.checkFailed"), {
          description: err instanceof Error ? err.message : t("updater.unknownError"),
        });
      }
      console.warn("[updater] check failed:", err);
    } finally {
      setChecking(false);
    }
  }

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
      {/* Manual check button — rendered by the parent (Settings) */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => void checkForUpdates(true)}
        disabled={checking}
      >
        {checking ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        {t("updater.checkButton")}
      </Button>

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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
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
    if (typeof window !== "undefined" && "__TAURI__" in window) {
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
    <Badge variant="outline" className="gap-1.5 text-green-600">
      <CheckCircle2 className="h-3 w-3" />
      {t("updater.autoUpdateEnabled")}
    </Badge>
  );
}
