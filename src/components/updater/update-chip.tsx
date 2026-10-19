"use client";

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, Download, Loader2, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/hooks/use-i18n";
import { localizeServerMessage } from "@/lib/i18n/localize-server-message";
import {
  downloadUpdate,
  installUpdate,
  retryUpdate,
} from "@/lib/updater/update-controller";
import {
  IDLE_SNAPSHOT,
  getUpdateSnapshot,
  subscribeUpdate,
  type UpdateSnapshot,
} from "@/lib/updater/update-store";
import { intlLocale } from "@/lib/utils";

/** Release notes can be long; show enough to be useful and no more. */
const MAX_NOTES_CHARS = 1500;

function serverSnapshot(): UpdateSnapshot {
  return IDLE_SNAPSHOT;
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(intlLocale(locale));
}

/**
 * The software-update chip in the top bar.
 *
 * It stays quietly in the bar for as long as an update is waiting, and the
 * seller chooses when to act: Download, keep working while it downloads, then
 * "Restart to update" whenever it suits them. It never opens by itself, never
 * covers the workspace and never comes back after being dismissed, because
 * dismissing it only closes the small panel.
 */
export function UpdateChip() {
  const { t, locale } = useI18n();
  const update = useSyncExternalStore(subscribeUpdate, getUpdateSnapshot, serverSnapshot);
  const [open, setOpen] = useState(false);

  if (update.phase === "idle") return null;

  const { phase, percent } = update;
  const working = phase === "downloading" || phase === "installing";

  const label =
    phase === "available"
      ? t("updater.chip.available")
      : phase === "downloading"
        ? percent > 0
          ? `${percent}%`
          : t("updater.downloading")
        : phase === "ready"
          ? t("updater.chip.ready")
          : phase === "installing"
            ? t("updater.chip.installing")
            : t("updater.installFailed");

  const title =
    phase === "available"
      ? t("updater.available")
      : phase === "downloading"
        ? t("updater.downloading")
        : phase === "ready"
          ? t("updater.readyTitle")
          : phase === "installing"
            ? t("updater.chip.installing")
            : t("updater.installFailed");

  const icon =
    phase === "ready" ? (
      <RotateCw className="size-3.5" aria-hidden="true" />
    ) : phase === "error" ? (
      <AlertTriangle className="size-3.5" aria-hidden="true" />
    ) : working ? (
      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    ) : (
      <Download className="size-3.5" aria-hidden="true" />
    );

  const date = formatDate(update.date, locale);
  const notes =
    update.notes && update.notes.length > MAX_NOTES_CHARS
      ? `${update.notes.slice(0, MAX_NOTES_CHARS)}…`
      : update.notes;
  const accessibleName = update.version
    ? `${title} · ${t("updater.version", { version: update.version })}`
    : title;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={phase === "ready" ? "default" : "ghost"}
          size="xs"
          data-slot="update-chip"
          data-phase={phase}
          className={`relative overflow-hidden ${phase === "error" ? "text-destructive" : ""}`}
          aria-label={accessibleName}
          disabled={phase === "installing"}
        >
          {icon}
          {phase === "downloading" ? (
            <span dir="ltr" className="tabular-nums">
              {label}
            </span>
          ) : (
            <span className="hidden sm:inline">{label}</span>
          )}
          {phase === "downloading" ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 block h-0.5 bg-primary/15"
            >
              <span
                className="block h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <span className="sr-only" role="status" aria-live="polite">
        {phase === "installing" ? t("updater.installingDesc") : accessibleName}
      </span>

      <PopoverContent align="end" className="w-80 space-y-3 p-4" data-slot="update-popover">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </p>
          <p className="text-xs text-muted-foreground">
            {phase === "available"
              ? t("updater.availableDesc")
              : phase === "downloading"
                ? t("updater.downloadingDesc")
                : phase === "ready"
                  ? t("updater.readyDesc")
                  : phase === "installing"
                    ? t("updater.installingDesc")
                    : t("updater.failedDesc")}
          </p>
        </div>

        {update.version ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline">{t("updater.version", { version: update.version })}</Badge>
            {date ? <span className="text-xs text-muted-foreground">{date}</span> : null}
          </div>
        ) : null}

        {phase === "available" ? (
          <p className="text-xs text-muted-foreground">{t("updater.downloadHint")}</p>
        ) : null}

        {phase === "downloading" ? (
          <div
            role="progressbar"
            aria-label={t("updater.downloading")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent > 0 ? percent : undefined}
            aria-valuetext={percent > 0 ? t("updater.progressLabel", { percent }) : undefined}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}

        {phase === "error" && update.error ? (
          <p dir="auto" className="break-words text-xs text-muted-foreground">
            {localizeServerMessage(update.error)}
          </p>
        ) : null}

        {notes && (phase === "available" || phase === "ready") ? (
          <details className="rounded-control bg-muted/50 p-2 text-xs">
            <summary className="cursor-pointer select-none font-medium">
              {t("updater.notes")}
            </summary>
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans">
              {notes}
            </pre>
          </details>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {phase === "available" ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                {t("updater.later")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  void downloadUpdate();
                }}
              >
                <Download className="size-4" aria-hidden="true" />
                {t("updater.download")}
              </Button>
            </>
          ) : null}

          {phase === "ready" ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                {t("updater.later")}
              </Button>
              <Button type="button" size="sm" onClick={() => void installUpdate()}>
                <RotateCw className="size-4" aria-hidden="true" />
                {t("updater.restartNow")}
              </Button>
            </>
          ) : null}

          {phase === "error" ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                {t("updater.later")}
              </Button>
              <Button type="button" size="sm" onClick={() => void retryUpdate()}>
                {t("updater.retry")}
              </Button>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
