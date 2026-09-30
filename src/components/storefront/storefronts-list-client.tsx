"use client";

import { useMemo, useState } from "react";
import { KeyRound, Loader2, Search } from "lucide-react";

import { StorefrontCard } from "@/components/storefront/storefront-card";
import type { StorefrontStudioProduct } from "@/components/storefront/studio/studio-types";
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
import {
  getStorefrontStudioContentCopy,
  type StorefrontStudioContentLocale,
} from "@/lib/i18n/storefront-studio-content";
import type { StorefrontConfig } from "@/lib/storefront/service";
import type { StorefrontPerformance } from "@/lib/storefront/storefront-performance";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Props {
  configs: StorefrontConfig[];
  /** Active products the stores reference (for the live miniatures). */
  products: StorefrontStudioProduct[];
  /** Per-store sales over the last 30 days, keyed by slug. */
  performance: Record<string, StorefrontPerformance>;
  canManage: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

type ApiPayload = { error?: string; code?: string };

export function StorefrontsListClient({
  configs: initial,
  products,
  performance,
  canManage,
  canPublish,
  canDelete,
}: Props) {
  const { t, locale } = useI18n();
  const language = (
    locale.startsWith("ar") ? "ar" : locale.startsWith("en") ? "en" : "fr"
  ) as StorefrontStudioContentLocale;
  const studioCopy = (key: Parameters<typeof getStorefrontStudioContentCopy>[1]) =>
    getStorefrontStudioContentCopy(language, key);
  const canMutate = canManage && canPublish;
  const [configs, setConfigs] = useState(initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "live" | "offline">("all");
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const [deleteTarget, setDeleteTarget] = useState<StorefrontConfig | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [pin, setPin] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  function resetDeleteFlow() {
    setDeleteTarget(null);
    setDeleteBusy(false);
    setReauthRequired(false);
    setPin("");
    setReauthBusy(false);
    setReauthError(null);
  }

  function openDelete(config: StorefrontConfig) {
    if (!canDelete) return;
    setDeleteTarget(config);
    setDeleteBusy(false);
    setReauthRequired(false);
    setPin("");
    setReauthError(null);
  }

  async function confirmDelete(proofRefreshed = false) {
    if (!canDelete || !deleteTarget || deleteBusy) return;
    const target = deleteTarget;
    setDeleteBusy(true);
    setReauthError(null);
    try {
      const response = await fetch(`/api/storefront/config/${target.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (
        response.status === 403 &&
        payload.code === "REAUTHENTICATION_REQUIRED" &&
        !proofRefreshed
      ) {
        setReauthRequired(true);
        return;
      }
      if (!response.ok) {
        throw new Error(
          payload.error || t("storefront.list.error.deleteFailed"),
        );
      }
      setConfigs((previous) =>
        previous.filter((config) => config.id !== target.id),
      );
      toast.success(t("storefront.list.deleted"));
      resetDeleteFlow();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("storefront.list.error.generic"),
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function verifyPinAndDelete() {
    if (!pin.trim() || reauthBusy) return;
    setReauthBusy(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) {
        setReauthError(payload.error ?? studioCopy("verificationFailed"));
        return;
      }
      setReauthRequired(false);
      setPin("");
      await confirmDelete(true);
    } catch {
      setReauthError(studioCopy("verificationFailed"));
    } finally {
      setReauthBusy(false);
    }
  }

  const query = search.trim().toLocaleLowerCase();
  const visible = configs.filter((config) => {
    if (filter === "live" && !config.isActive) return false;
    if (filter === "offline" && config.isActive) return false;
    if (!query) return true;
    return (
      config.name.toLocaleLowerCase().includes(query) ||
      config.slug.toLocaleLowerCase().includes(query)
    );
  });

  async function copyLink(config: StorefrontConfig) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/storefront/${config.slug}`);
      toast.success(t("storefront.list.linkCopied"));
    } catch {
      toast.error(t("storefront.list.error.generic"));
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3" data-storefront-list-toolbar="true">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("storefront.list.search")}
            aria-label={t("storefront.list.search")}
            className="ps-9"
          />
        </div>
        <div role="group" aria-label={t("storefront.list.search")} className="inline-flex rounded-control border bg-muted/40 p-0.5">
          {(["all", "live", "offline"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "min-h-8 rounded-control px-3 text-body-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                filter === value ? "bg-background text-foreground shadow-(--elevation-1)" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(value === "all" ? "storefront.list.filterAll" : value === "live" ? "storefront.list.filterLive" : "storefront.list.filterOffline")}
              <span className="ms-1.5 tabular-nums text-muted-foreground">
                {value === "all"
                  ? configs.length
                  : configs.filter((config) => config.isActive === (value === "live")).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-surface border border-dashed p-10 text-center text-body-sm text-muted-foreground">
          {t("storefront.list.noMatch")}
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-storefront-list="true">
          {visible.map((config) => (
            <li key={config.id}>
              <StorefrontCard
                config={config}
                products={config.productIds.flatMap((id) => {
                  const product = productsById.get(id);
                  return product ? [product] : [];
                })}
                performance={performance[config.slug]}
                canMutate={canMutate}
                canDelete={canDelete}
                onCopyLink={() => void copyLink(config)}
                onDelete={() => openDelete(config)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={canDelete && deleteTarget !== null}
        onOpenChange={(open) => !open && resetDeleteFlow()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reauthRequired
                ? studioCopy("deleteVerificationTitle")
                : t("storefront.list.deleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {reauthRequired ? (
                studioCopy("deleteVerificationDescription")
              ) : (
                <>
                  {t("storefront.list.deleteConfirm", {
                    name: deleteTarget?.name ?? "",
                  })}{" "}
                  {t("storefront.list.deleteWarning", {
                    slug: `/storefront/${deleteTarget?.slug ?? ""}`,
                  })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {reauthRequired ? (
            <div className="space-y-3 rounded-surface border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4" aria-hidden="true" />
                {studioCopy("deleteVerificationTitle")}
              </div>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder={studioCopy("pinPlaceholder")}
                aria-label={studioCopy("pinPlaceholder")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void verifyPinAndDelete();
                }}
              />
              {reauthError ? (
                <p role="alert" className="text-xs text-destructive">
                  {reauthError}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={resetDeleteFlow} disabled={reauthBusy}>
              {t("storefront.list.cancel")}
            </Button>
            {reauthRequired ? (
              <Button
                variant="destructive"
                onClick={() => void verifyPinAndDelete()}
                disabled={!pin.trim() || reauthBusy || deleteBusy}
              >
                {reauthBusy || deleteBusy ? (
                  <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="me-2 size-4" aria-hidden="true" />
                )}
                {studioCopy("verifyAndDelete")}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => void confirmDelete()}
                disabled={deleteBusy}
              >
                {deleteBusy ? (
                  <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {t("storefront.list.confirmDelete")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
