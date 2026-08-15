"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ExternalLink,
  History,
  KeyRound,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "@/lib/toast";

interface Props {
  configs: StorefrontConfig[];
  canManage: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

type ApiPayload = { error?: string; code?: string };

export function StorefrontsListClient({
  configs: initial,
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

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {configs.map((config) => (
          <Card key={config.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="line-clamp-1 text-base font-semibold">
                  {config.name}
                </CardTitle>
                {config.isActive ? (
                  <Badge>{t("storefront.list.active")}</Badge>
                ) : (
                  <Badge variant="outline">
                    {t("storefront.list.inactive")}
                  </Badge>
                )}
              </div>
              <p
                dir="ltr"
                className="font-mono text-xs text-muted-foreground"
              >
                /storefront/{config.slug}
              </p>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-3">
              {config.description ? (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {config.description}
                </p>
              ) : null}

              <div className="space-y-1 text-xs text-muted-foreground">
                <div>
                  {t("storefront.list.productsCount", {
                    count: config.productIds.length,
                  })}
                  {" · "}
                  <span className="font-medium capitalize">
                    {config.theme.template}
                  </span>
                </div>
              </div>

              <div className="mt-auto flex items-center gap-1.5 pt-2">
                {canMutate ? (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="flex-1"
                  >
                    <Link href={`/storefronts/${config.id}/studio`}>
                      <Pencil className="me-1.5 size-3.5" aria-hidden="true" />
                      {t("storefront.list.edit")}
                    </Link>
                  </Button>
                ) : null}

                {canMutate ? (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    title={studioCopy("releaseManagement")}
                    aria-label={studioCopy("releaseManagement")}
                  >
                    <Link href={`/storefronts/${config.id}/history`}>
                      <History className="size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}

                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  title={t("storefront.list.publicPreview")}
                  aria-label={t("storefront.list.publicPreview")}
                >
                  <a
                    href={`/storefront/${config.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>

                {canDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t("storefront.list.delete")}
                    aria-label={t("storefront.list.delete")}
                    className="text-destructive hover:text-destructive"
                    onClick={() => openDelete(config)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
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
