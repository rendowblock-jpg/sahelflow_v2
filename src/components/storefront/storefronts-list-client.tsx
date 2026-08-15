"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ExternalLink,
  History,
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
}

export function StorefrontsListClient({
  configs: initial,
  canManage,
  canPublish,
}: Props) {
  const { t, locale } = useI18n();
  const language = (
    locale.startsWith("ar") ? "ar" : locale.startsWith("en") ? "en" : "fr"
  ) as StorefrontStudioContentLocale;
  const studioCopy = (key: Parameters<typeof getStorefrontStudioContentCopy>[1]) =>
    getStorefrontStudioContentCopy(language, key);
  const canMutate = canManage && canPublish;
  const [configs, setConfigs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<StorefrontConfig | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/storefront/config/${target.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || t("storefront.list.error.deleteFailed"),
          );
        }
        setConfigs((prev) => prev.filter((config) => config.id !== target.id));
        toast.success(t("storefront.list.deleted"));
        setDeleteTarget(null);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("storefront.list.error.generic"),
        );
      }
    });
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

                {canMutate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t("storefront.list.delete")}
                    aria-label={t("storefront.list.delete")}
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(config)}
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
        open={canMutate && deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("storefront.list.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("storefront.list.deleteConfirm", {
                name: deleteTarget?.name ?? "",
              })}{" "}
              {t("storefront.list.deleteWarning", {
                slug: `/storefront/${deleteTarget?.slug ?? ""}`,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("storefront.list.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t("storefront.list.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
