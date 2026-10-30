"use client";

import { useState } from "react";
import { Check, DatabaseBackup, Download, Loader2, ShieldCheck } from "lucide-react";

import { IconTile } from "@/components/system";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import {
  backupSize,
  downloadFileName,
  LOCKOUT_EXPORT_ENTITIES,
  lockoutExportFallbackName,
  lockoutExportUrl,
  rescueFailureFromStatus,
  type LockoutExportEntity,
  type RescueFailure,
} from "@/lib/license/lockout-data-rescue";
import { intlLocale, numberFormatter } from "@/lib/utils";

type Outcome =
  | { kind: "idle" }
  | { kind: "busy"; name: string }
  | { kind: "done"; text: string }
  | { kind: "error"; failure: RescueFailure };

const IDLE: Outcome = { kind: "idle" };
const BUSY_CLASS = "aria-disabled:pointer-events-none aria-disabled:opacity-60";

/** Saves a blob the way the Inbox attachments and privacy export already do, so it behaves the same in the packaged WebView. */
function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function Result({ outcome }: { outcome: Outcome }) {
  const { t } = useI18n();
  if (outcome.kind === "error") {
    return (
      <p className="text-body-sm text-destructive" role="alert">
        {t(`license.lockout.data.error.${outcome.failure}`)}
        {outcome.failure === "signIn" ? (
          <>
            {" "}
            <a href="/login" className="font-medium underline underline-offset-2">
              {t("license.lockout.data.signIn")}
            </a>
          </>
        ) : null}
      </p>
    );
  }
  // The live region stays in the page so a screen reader hears the change.
  return (
    <p className="min-h-5 text-body-sm text-muted-foreground" role="status" aria-live="polite">
      {outcome.kind === "busy" ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {outcome.name}
        </span>
      ) : null}
      {outcome.kind === "done" ? (
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <Check className="size-3.5 text-success" aria-hidden="true" />
          {outcome.text}
        </span>
      ) : null}
    </p>
  );
}

/**
 * IDN-03: a lapsed licence stops the shop from operating, never from handing
 * the seller their data. Works with the three calls the licence gate leaves
 * open (the entity exports and the local backup); anything else stays locked.
 */
export function LockoutDataRescue() {
  const { t, locale } = useI18n();
  const [download, setDownload] = useState<Outcome>(IDLE);
  const [backup, setBackup] = useState<Outcome>(IDLE);
  const downloading = download.kind === "busy";
  const backingUp = backup.kind === "busy";

  async function downloadEntity(entity: LockoutExportEntity) {
    if (downloading) return;
    const name = t(`license.lockout.data.entity.${entity}`);
    setDownload({ kind: "busy", name: t("license.lockout.data.preparing", { name }) });
    try {
      const response = await fetch(lockoutExportUrl(entity), { credentials: "same-origin" });
      if (!response.ok) {
        setDownload({ kind: "error", failure: rescueFailureFromStatus(response.status) });
        return;
      }
      const blob = await response.blob();
      if (blob.size <= 0) {
        setDownload({ kind: "error", failure: "failed" });
        return;
      }
      saveBlob(
        blob,
        downloadFileName(
          response.headers.get("content-disposition"),
          lockoutExportFallbackName(entity),
        ),
      );
      setDownload({ kind: "done", text: t("license.lockout.data.downloaded", { name }) });
    } catch {
      setDownload({ kind: "error", failure: "network" });
    }
  }

  async function createBackup() {
    if (backingUp) return;
    setBackup({ kind: "busy", name: t("license.lockout.data.backupBusy") });
    try {
      const response = await fetch("/api/backup/create", { method: "POST", credentials: "same-origin" });
      if (!response.ok) {
        setBackup({ kind: "error", failure: rescueFailureFromStatus(response.status) });
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      const bytes =
        typeof payload === "object" && payload !== null && "containerBytes" in payload
          ? (payload as { containerBytes?: unknown }).containerBytes
          : undefined;
      const size = backupSize(bytes);
      const formatted = size
        ? `${numberFormatter(intlLocale(locale), { maximumFractionDigits: 1 }).format(size.value)} ${size.unit}`
        : null;
      setBackup({
        kind: "done",
        text: formatted
          ? t("license.lockout.data.backupDoneSize", { size: formatted })
          : t("license.lockout.data.backupDone"),
      });
    } catch {
      setBackup({ kind: "error", failure: "network" });
    }
  }

  return (
    <section
      className="space-y-5 rounded-surface border bg-surface-2 p-5"
      aria-labelledby="license-data-title"
      data-testid="license-lockout-data"
    >
      <div className="flex items-start gap-3">
        <IconTile icon={ShieldCheck} tone="success" size="md" />
        <div className="min-w-0 space-y-0.5">
          <h2 id="license-data-title" className="text-title-3 text-foreground">
            {t("license.lockout.data.title")}
          </h2>
          <p className="text-body-sm text-muted-foreground">{t("license.lockout.data.description")}</p>
        </div>
      </div>

      <div role="group" aria-labelledby="license-data-download-title" className="space-y-2">
        <h3 id="license-data-download-title" className="text-body-sm font-medium text-foreground">
          {t("license.lockout.data.downloadTitle")}
        </h3>
        <p id="license-data-download-hint" className="text-caption text-muted-foreground">
          {t("license.lockout.data.downloadHint")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {LOCKOUT_EXPORT_ENTITIES.map((entity) => (
            <Button
              key={entity}
              type="button"
              variant="outline"
              className={`justify-start text-start ${BUSY_CLASS}`}
              aria-disabled={downloading}
              aria-describedby="license-data-download-hint"
              onClick={() => void downloadEntity(entity)}
            >
              <Download className="me-1.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{t(`license.lockout.data.entity.${entity}`)}</span>
            </Button>
          ))}
        </div>
        <Result outcome={download} />
      </div>

      <div role="group" aria-labelledby="license-data-backup-title" className="space-y-2">
        <h3 id="license-data-backup-title" className="text-body-sm font-medium text-foreground">
          {t("license.lockout.data.backupTitle")}
        </h3>
        <p id="license-data-backup-hint" className="text-caption text-muted-foreground">
          {t("license.lockout.data.backupDescription")}
        </p>
        <Button
          type="button"
          variant="outline"
          className={`w-full ${BUSY_CLASS}`}
          aria-disabled={backingUp}
          aria-describedby="license-data-backup-hint"
          onClick={() => void createBackup()}
        >
          <DatabaseBackup className="me-1.5 size-4" aria-hidden="true" />
          {t("license.lockout.data.backupButton")}
        </Button>
        <Result outcome={backup} />
      </div>
    </section>
  );
}
