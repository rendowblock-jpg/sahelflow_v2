"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Loader2,
  Pencil,
  RotateCcw,
  Store,
  Trash2,
} from "lucide-react";

import { Field } from "@/components/system";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import { useShopStore, type ShopArchive } from "@/stores/shop-store";

/**
 * Shop lifecycle administration (register row FN-03).
 *
 * `renameShop`, `archiveShop`, `recoverShop`, `removeShop` and `loadArchives`
 * each had a guarded API route, a native Rust lifecycle mutation and signed
 * entitlement authority behind them, and ZERO references outside
 * `src/stores/shop-store.ts`. A seller could switch shops and create one, but
 * could not rename, archive, recover or delete one from anywhere in the app.
 *
 * The browser only submits intent. Every one of these calls returns a native
 * `pending` receipt — the packaged Rust host owns quiesce, commit,
 * compensation and restart, and replaces this page itself when the target
 * runtime is ready. That is why nothing here optimistically mutates the list
 * or shows a success state for the switch: it reports the receipt was accepted
 * and says the app will restart itself.
 *
 * Outside the desktop shell the store throws before any request is made, and
 * `translateServerError` maps that onto `shops.lifecycleError`.
 */

type PendingKind = "rename" | "archive" | "delete" | "recover";

export function ShopsPanel() {
  const { t, locale } = useI18n();
  const shops = useShopStore((state) => state.shops);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const loadShops = useShopStore((state) => state.loadShops);
  const renameShop = useShopStore((state) => state.renameShop);
  const archiveShop = useShopStore((state) => state.archiveShop);
  const removeShop = useShopStore((state) => state.removeShop);
  const recoverShop = useShopStore((state) => state.recoverShop);
  const loadArchives = useShopStore((state) => state.loadArchives);

  const [archives, setArchives] = useState<readonly ShopArchive[]>([]);
  const [archivesError, setArchivesError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; kind: PendingKind } | null>(
    null,
  );

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const readArchives = useCallback(async (): Promise<
    { ok: true; archives: readonly ShopArchive[] } | { ok: false; error: string }
  > => {
    try {
      return { ok: true, archives: await loadArchives() };
    } catch (caught) {
      return {
        ok: false,
        error: translateServerError(caught, t, t("shops.archivesLoadError")),
      };
    }
  }, [loadArchives, t]);

  /** Re-read the archives after a lifecycle action changed them. */
  const refreshArchives = useCallback(async () => {
    const result = await readArchives();
    if (result.ok) {
      setArchives(result.archives);
      setArchivesError(null);
    } else {
      setArchivesError(result.error);
    }
  }, [readArchives]);

  useEffect(() => {
    // The read resolves outside the effect body and the abort guard drops a
    // late response, so the effect itself never sets state directly
    // (react-hooks/set-state-in-effect).
    const controller = new AbortController();
    void loadShops();
    void readArchives().then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setArchives(result.archives);
        setArchivesError(null);
      } else {
        setArchivesError(result.error);
      }
    });
    return () => controller.abort();
  }, [loadShops, readArchives]);

  // The only shop is the seller's whole business: archiving or deleting it
  // would leave the installation with nothing to open.
  const isLastShop = shops.length <= 1;

  const renameShopRecord = shops.find((shop) => shop.id === renameTarget) ?? null;
  const deleteShopRecord = shops.find((shop) => shop.id === deleteTarget) ?? null;

  async function run(
    id: string,
    kind: PendingKind,
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    setBusy({ id, kind });
    try {
      await action();
      toast.success(successMessage);
      toast.info(t("shops.pendingNotice"));
      return true;
    } catch (caught) {
      toast.error(translateServerError(caught, t, t("shops.lifecycleError")));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleRename() {
    const name = renameValue.trim();
    if (!renameTarget) return;
    if (!name) {
      setRenameError(t("shops.nameRequired"));
      return;
    }
    const ok = await run(
      renameTarget,
      "rename",
      () => renameShop(renameTarget, name),
      t("shops.renamed", { name }),
    );
    if (ok) {
      setRenameTarget(null);
      setRenameValue("");
      setRenameError(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !deleteShopRecord) return;
    if (deleteConfirm.trim() !== deleteShopRecord.name.trim()) {
      setDeleteError(t("shops.deleteConfirmLabel"));
      return;
    }
    const ok = await run(
      deleteTarget,
      "delete",
      () => removeShop(deleteTarget),
      t("shops.deleted"),
    );
    if (ok) {
      setDeleteTarget(null);
      setDeleteConfirm("");
      setDeleteError(null);
    }
  }

  const busyOn = (id: string, kind: PendingKind) =>
    busy?.id === id && busy.kind === kind;
  const anyBusy = busy !== null;

  return (
    <section className="space-y-5" aria-labelledby="shops-panel-title">
      <div>
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 id="shops-panel-title" className="text-base font-semibold">
            {t("shops.manageTitle")}
          </h3>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("shops.manageDescription")}
        </p>
      </div>

      <ul className="space-y-2">
        {shops.map((shop) => {
          const active = shop.id === activeShopId;
          return (
            <li
              key={shop.id}
              className="flex flex-col gap-3 rounded-surface border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-lg" aria-hidden="true">
                  {shop.icon ?? "🏪"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{shop.name}</p>
                  {active ? (
                    <p className="text-xs text-primary">
                      {t("shops.activeShop")}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={anyBusy}
                  onClick={() => {
                    setRenameTarget(shop.id);
                    setRenameValue(shop.name);
                    setRenameError(null);
                  }}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  {t("shops.rename")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={anyBusy || isLastShop}
                  title={isLastShop ? t("shops.lastShop") : undefined}
                  onClick={() =>
                    void run(
                      shop.id,
                      "archive",
                      () => archiveShop(shop.id),
                      t("shops.archived"),
                    ).then((ok) => {
                      if (ok) void refreshArchives();
                    })
                  }
                >
                  {busyOn(shop.id, "archive") ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Archive className="size-4" aria-hidden="true" />
                  )}
                  {t("shops.archive")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={anyBusy || isLastShop}
                  title={isLastShop ? t("shops.lastShop") : undefined}
                  onClick={() => {
                    setDeleteTarget(shop.id);
                    setDeleteConfirm("");
                    setDeleteError(null);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("shops.delete")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("shops.archives")}</h4>
        {archivesError ? (
          <p role="alert" className="text-xs text-destructive">
            {archivesError}
          </p>
        ) : archives.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("shops.archivesEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {archives.map((archive) => (
              <li
                key={archive.archiveId}
                className="flex flex-col gap-3 rounded-surface border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {archive.shop.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("shops.archivedAt", {
                      date: formatDate(
                        new Date(archive.archivedAtUnixMs),
                        locale,
                      ),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={anyBusy}
                  onClick={() =>
                    void run(
                      archive.archiveId,
                      "recover",
                      () => recoverShop(archive.archiveId),
                      t("shops.recovered"),
                    ).then((ok) => {
                      if (ok) void refreshArchives();
                    })
                  }
                >
                  {busyOn(archive.archiveId, "recover") ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="size-4" aria-hidden="true" />
                  )}
                  {t("shops.recover")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (anyBusy) return;
          if (!open) {
            setRenameTarget(null);
            setRenameError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("shops.renameTitle")}</DialogTitle>
            <DialogDescription>{renameShopRecord?.name}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field
              id="shops-rename-name"
              label={t("shops.nameLabel")}
              error={renameError ?? undefined}
              required
            >
              {(control) => (
                <Input
                  {...control}
                  value={renameValue}
                  maxLength={50}
                  autoFocus
                  disabled={anyBusy}
                  onChange={(event) => {
                    setRenameValue(event.target.value);
                    if (renameError) setRenameError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleRename();
                    }
                  }}
                />
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameTarget(null)}
              disabled={anyBusy}
            >
              {t("shops.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleRename()}
              disabled={anyBusy || !renameValue.trim()}
            >
              {busy?.kind === "rename" ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t("shops.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (anyBusy) return;
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("shops.deleteTitle")}
            </DialogTitle>
            <DialogDescription>{t("shops.deleteWarning")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {/*
              Type-to-confirm on the shop's own name, matching the Danger Zone
              convention: a locale-neutral token the seller can type on their
              own keyboard, rather than a Latin keyword.
            */}
            <Field
              id="shops-delete-confirm"
              label={t("shops.deleteConfirmLabel")}
              help={deleteShopRecord?.name}
              error={deleteError ?? undefined}
              required
            >
              {(control) => (
                <Input
                  {...control}
                  value={deleteConfirm}
                  autoFocus
                  disabled={anyBusy}
                  onChange={(event) => {
                    setDeleteConfirm(event.target.value);
                    if (deleteError) setDeleteError(null);
                  }}
                />
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={anyBusy}
            >
              {t("shops.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={
                anyBusy ||
                deleteConfirm.trim() !== (deleteShopRecord?.name.trim() ?? " ")
              }
            >
              {busy?.kind === "delete" ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t("shops.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
