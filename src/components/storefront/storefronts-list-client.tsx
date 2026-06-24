"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import { ExternalLink, Pencil, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import type { StorefrontConfig } from "@/lib/storefront/service";

interface Props {
  configs: StorefrontConfig[];
}

export function StorefrontsListClient({ configs: initial }: Props) {
  const { t } = useI18n();
  const [configs, setConfigs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<StorefrontConfig | null>(null);

  async function toggleActive(config: StorefrontConfig) {
    const newValue = !config.isActive;
    // Optimistic update
    setConfigs((prev) =>
      prev.map((c) => (c.id === config.id ? { ...c, isActive: newValue } : c)),
    );

    try {
      const res = await fetch(`/api/storefront/config/${config.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("storefront.list.error.updateFailed"));
      }
      toast.success(newValue ? t("storefront.list.activated") : t("storefront.list.deactivated"));
    } catch (err) {
      // Revert on failure
      setConfigs((prev) =>
        prev.map((c) => (c.id === config.id ? { ...c, isActive: config.isActive } : c)),
      );
      toast.error(err instanceof Error ? err.message : t("storefront.list.error.generic"));
    }
  }

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
          throw new Error(data.error || t("storefront.list.error.deleteFailed"));
        }
        setConfigs((prev) => prev.filter((c) => c.id !== target.id));
        toast.success(t("storefront.list.deleted"));
        setDeleteTarget(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("storefront.list.error.generic"));
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
                <CardTitle className="text-base font-semibold line-clamp-1">
                  {config.name}
                </CardTitle>
                {config.isActive ? (
                  <Badge>{t("storefront.list.active")}</Badge>
                ) : (
                  <Badge variant="outline">{t("storefront.list.inactive")}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                /storefront/{config.slug}
              </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3">
              {config.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {config.description}
                </p>
              )}
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  {t("storefront.list.productsCount", { count: config.productIds.length })}
                  {" · "}
                  <span className="font-medium capitalize">{config.theme.template}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-auto pt-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={`/storefronts/${config.id}`}>
                    <Pencil className="h-3.5 w-3.5 me-1.5" />
                    {t("storefront.list.edit")}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost" title={t("storefront.list.publicPreview")}>
                  <a
                    href={`/storefront/${config.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={config.isActive ? t("storefront.list.deactivate") : t("storefront.list.activate")}
                  onClick={() => toggleActive(config)}
                >
                  {config.isActive ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={t("storefront.list.delete")}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(config)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("storefront.list.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("storefront.list.deleteConfirm", { name: deleteTarget?.name ?? "" })}{" "}
              {t("storefront.list.deleteWarning", { slug: `/storefront/${deleteTarget?.slug ?? ""}` })}
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
              {pending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {t("storefront.list.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
