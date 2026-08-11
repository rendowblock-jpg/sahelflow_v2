"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  DatabaseBackup,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { isTauriEnv } from "@/lib/env";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { toast } from "@/lib/toast";
import {
  COPY,
  errorMessage,
  formatSize,
  type SupportedLocale,
} from "./backup-restore-copy";

interface BackupEntry {
  backupId: string;
  createdAtUnixMs: number;
  verifiedAtUnixMs: number;
  retentionClass: string;
  pinned: boolean;
  workspaceId: string;
  sourceInstallationId: string;
  shopCount: number;
  plaintextBytes: number;
  containerBytes: number;
  status: "verified" | "available" | "recovery-kit-required" | "corrupt";
  location: string;
  requiresRecoveryKit: boolean;
  independentRecoveryReady: boolean;
}

interface RecoveryKitResult {
  kitId: string;
  path: string;
  recoveryCode: string;
  workspaceId: string;
  brkId: string;
  createdAtUnixMs: number;
}

type BackupCopy = Record<keyof (typeof COPY)["en"], string>;

function localeKey(locale: string): SupportedLocale {
  return locale === "ar" || locale === "en" ? locale : "fr";
}

function statusLabel(entry: BackupEntry, copy: BackupCopy): string {
  if (entry.status === "corrupt") return copy.corrupt;
  if (entry.requiresRecoveryKit) return copy.kitRequired;
  if (entry.independentRecoveryReady) return copy.ready;
  return copy.localAuthority;
}

export function BackupRestorePanel() {
  const { locale } = useI18n();
  const resolvedLocale = localeKey(locale);
  const copy: BackupCopy = COPY[resolvedLocale];
  const workspaceCopy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(resolvedLocale as SettingsWorkspaceLocale, key);
  const desktop = isTauriEnv();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(desktop);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingKit, setCreatingKit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [kitResult, setKitResult] = useState<RecoveryKitResult | null>(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const response = await fetch("/api/backup/list", { cache: "no-store" });
        const payload = (await response.json()) as {
          backups?: BackupEntry[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? copy.loadFailed);
        if (!cancelled) setBackups(payload.backups ?? []);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, desktop, reloadKey]);

  async function createBackup() {
    setCreating(true);
    try {
      const response = await fetch("/api/backup/create", { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? copy.actionFailed);
      toast.success(copy.createSuccess);
      reload();
    } catch (error) {
      toast.error(errorMessage(error, copy.actionFailed));
    } finally {
      setCreating(false);
    }
  }

  async function createRecoveryKit() {
    setCreatingKit(true);
    try {
      const response = await fetch("/api/backup/recovery-kit", { method: "POST" });
      const payload = (await response.json()) as RecoveryKitResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? copy.actionFailed);
      setKitResult(payload);
      toast.success(copy.kitSuccess);
      reload();
    } catch (error) {
      toast.error(errorMessage(error, copy.actionFailed));
    } finally {
      setCreatingKit(false);
    }
  }

  async function prepareRestore() {
    if (!restoreTarget) return;
    setBusyId(restoreTarget.backupId);
    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupId: restoreTarget.backupId,
          recoveryCode: recoveryCode.trim() || undefined,
          confirm: "RESTORE",
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? copy.actionFailed);
      toast.success(copy.restoreSuccess);
      setRestoreTarget(null);
      setRecoveryCode("");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      toast.error(errorMessage(error, copy.actionFailed));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteBackup() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.backupId);
    try {
      const response = await fetch(
        `/api/backup/${encodeURIComponent(deleteTarget.backupId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? copy.actionFailed);
      toast.success(copy.deleteSuccess);
      setDeleteTarget(null);
      reload();
    } catch (error) {
      toast.error(errorMessage(error, copy.actionFailed));
    } finally {
      setBusyId(null);
    }
  }

  const dateLocale =
    resolvedLocale === "ar"
      ? "ar-DZ"
      : resolvedLocale === "en"
        ? "en-GB"
        : "fr-DZ";

  return (
    <div dir={resolvedLocale === "ar" ? "rtl" : "ltr"}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10">
              <DatabaseBackup className="size-5 text-primary" aria-hidden="true" />
            </span>
            {copy.title}
          </CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!desktop ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {copy.desktopOnly}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void createBackup()}
                  disabled={creating || creatingKit || loadError}
                >
                  {creating ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  {creating ? copy.creating : copy.create}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void createRecoveryKit()}
                  disabled={creating || creatingKit || loadError}
                >
                  {creatingKit ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound className="size-4" aria-hidden="true" />
                  )}
                  {creatingKit ? copy.creatingKit : copy.createKit}
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
                  {workspaceCopy("loading")}
                </div>
              ) : loadError ? (
                <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-warning/25 bg-warning/5 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle
                      className="mt-0.5 size-5 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-semibold">
                        {workspaceCopy("unavailable")}
                      </p>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                        {workspaceCopy("unavailableDescription")}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={reload}
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {workspaceCopy("retry")}
                  </Button>
                </div>
              ) : backups.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <ShieldCheck
                    className="mx-auto mb-2 size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium">{copy.empty}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {copy.emptyDescription}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{copy.backup}</TableHead>
                        <TableHead>{copy.shops}</TableHead>
                        <TableHead>{copy.size}</TableHead>
                        <TableHead>{copy.verified}</TableHead>
                        <TableHead>{copy.recovery}</TableHead>
                        <TableHead className="text-end">{copy.actions}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backups.map((entry) => {
                        const busy = busyId === entry.backupId;
                        return (
                          <TableRow key={entry.backupId}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-mono text-xs" dir="ltr">
                                  {entry.backupId}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(entry.createdAtUnixMs).toLocaleString(
                                    dateLocale,
                                  )}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {entry.shopCount}
                            </TableCell>
                            <TableCell className="tabular-nums" dir="ltr">
                              {formatSize(entry.containerBytes)}
                            </TableCell>
                            <TableCell>{entry.status}</TableCell>
                            <TableCell>{statusLabel(entry, copy)}</TableCell>
                            <TableCell className="text-end">
                              <div className="inline-flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || entry.status === "corrupt"}
                                  onClick={() => {
                                    setRecoveryCode("");
                                    setRestoreTarget(entry);
                                  }}
                                >
                                  {busy ? (
                                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <RotateCcw className="size-3.5" aria-hidden="true" />
                                  )}
                                  {copy.restore}
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  disabled={busy}
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget(entry)}
                                  aria-label={copy.delete}
                                >
                                  <Trash2 className="size-3.5" aria-hidden="true" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {restoreTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-title"
            className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-xl"
          >
            <div>
              <h2 id="restore-title" className="font-semibold">
                {copy.restoreTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.restoreDescription}
              </p>
            </div>
            <p className="rounded-md bg-muted p-2 font-mono text-xs" dir="ltr">
              {restoreTarget.backupId}
            </p>
            {restoreTarget.requiresRecoveryKit ? (
              <label className="block space-y-2 text-sm">
                <span>{copy.recoveryCode}</span>
                <Input
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                />
                <span className="block text-xs text-muted-foreground">
                  {copy.recoveryCodeHint}
                </span>
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRestoreTarget(null);
                  setRecoveryCode("");
                }}
                disabled={busyId !== null}
              >
                {copy.cancel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void prepareRestore()}
                disabled={
                  busyId !== null ||
                  (restoreTarget.requiresRecoveryKit && !recoveryCode.trim())
                }
              >
                {busyId ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {busyId ? copy.preparingRestore : copy.confirmRestore}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {kitResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kit-title"
            className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-xl"
          >
            <div>
              <h2 id="kit-title" className="font-semibold">
                {copy.kitTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.kitDescription}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{copy.kitPath}</p>
              <p
                className="break-all rounded-md bg-muted p-2 font-mono text-xs"
                dir="ltr"
              >
                {kitResult.path}
              </p>
              <p className="text-xs text-muted-foreground">{copy.codeLabel}</p>
              <p
                className="break-all rounded-md border p-3 font-mono text-sm"
                dir="ltr"
              >
                {kitResult.recoveryCode}
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setKitResult(null)}>
                {copy.saved}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={copy.deleteTitle}
        description={copy.deleteDescription}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={deleteBackup}
      />
    </div>
  );
}
