"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, DatabaseBackup, Download, RotateCcw, Trash2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface BackupEntry {
  filename: string;
  size: number;
  createdAt: string;
}

/** Format a byte count as a human-readable string (B / KB / MB / GB). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function BackupRestorePanel() {
  const { t, locale } = useI18n();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  // Bump to trigger a refetch (after create/delete). Initial load runs on mount.
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch the backup list. `loading` starts true, so we only flip it to
  // false once the first fetch resolves. Refetches (after create/delete)
  // bump `reloadKey`, which re-runs this effect without flickering the
  // whole list — the per-row buttons already show their own spinners.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/backup/list", { cache: "no-store" });
        if (!res.ok) throw new Error(t("common.fetchFailed"));
        const data = (await res.json()) as { backups: BackupEntry[] };
        if (cancelled) return;
        setBackups(data.backups ?? []);
      } catch {
        // Network/load error — leave the existing list (or empty state) in
        // place. The create/restore/delete actions surface their own errors.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Trigger a refetch (called from handleCreate / handleDelete)
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/backup/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? t("common.createFailed"));
      }
      toast.success(t("backup.createSuccess"));
      reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("backup.createFailed"),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setActionInProgress(restoreTarget.filename);
    try {
      // The restore route's zod schema enforces confirm: z.literal("RESTORE")
      // as an API-level safety net (separate from the AlertDialog the user
      // already clicked to get here). Without this field the API returns 400
      // and the restore silently fails.
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: restoreTarget.filename,
          confirm: "RESTORE",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? t("common.restoreFailed"));
      }
      toast.success(t("backup.restoreSuccess"));
      setRestoreTarget(null);
      // Reload the page so all in-memory caches / open Prisma connections
      // are re-established against the freshly-overwritten DB.
      if (typeof window !== "undefined") {
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("backup.restoreFailed"),
      );
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setActionInProgress(deleteTarget.filename);
    try {
      const res = await fetch(
        `/api/backup/${encodeURIComponent(deleteTarget.filename)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? t("common.deleteFailed"));
      }
      toast.success(t("backup.deleteSuccess"));
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("backup.deleteFailed"),
      );
    } finally {
      setActionInProgress(null);
    }
  }

  const localeForDate = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <DatabaseBackup className="h-5 w-5 text-primary" />
            </span>
            {t("backup.title")}
          </CardTitle>
          <CardDescription>{t("backup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleCreate} disabled={creating || loading}>
              {creating ? (
                <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 me-1.5" />
              )}
              {creating ? t("backup.creating") : t("backup.createButton")}
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("backup.listTitle")}</h3>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {t("backup.loading")}
              </div>
            ) : backups.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Download className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-medium">{t("backup.empty")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("backup.emptyDesc")}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border">
                <div className="overflow-x-auto">
        <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("backup.columnFilename")}</TableHead>
                      <TableHead className="w-24">{t("backup.columnSize")}</TableHead>
                      <TableHead className="w-44">{t("backup.columnCreated")}</TableHead>
                      <TableHead className="w-44 text-end">
                        {t("backup.columnActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((b) => {
                      const busy = actionInProgress === b.filename;
                      return (
                        <TableRow key={b.filename}>
                          <TableCell className="font-mono text-xs break-all">
                            {b.filename}
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {formatSize(b.size)}
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {new Date(b.createdAt).toLocaleString(localeForDate, {
                              year: "numeric",
                              month: "short",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-end">
                            <div className="inline-flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRestoreTarget(b)}
                                disabled={busy}
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5 me-1" />
                                )}
                                {t("backup.restoreButton")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteTarget(b)}
                                disabled={busy}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="sr-only">
                                  {t("backup.deleteButton")}
                                </span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
        </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t("backup.restoreHint")}</p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRestoreTarget(null);
        }}
        title={t("backup.confirmRestoreTitle")}
        description={t("backup.confirmRestoreDesc")}
        confirmLabel={t("backup.restoreButton")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={handleRestore}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={t("backup.confirmDeleteTitle")}
        description={t("backup.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
