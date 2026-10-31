"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Plus, Trash2, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  MANAGER_TOUCH,
  ManagerEmpty,
  ManagerNoStore,
  ManagerSaveLine,
  settleResponse,
  useManagerAction,
} from "@/components/storefront/studio/manager-states";
import { toast } from "@/lib/toast";

export interface OfferRow {
  id: string;
  storefrontSlug: string;
  triggerProductName: string;
  triggerVariantId: string | null;
  triggerQuantity: number;
  rewardType: string;
  rewardProductName: string | null;
  rewardQuantity: number | null;
  isActive: boolean;
}

export interface ProductOption {
  id: string;
  name: string;
}

interface Props {
  offers: OfferRow[];
  storefronts: { slug: string; name: string }[];
  products: ProductOption[];
  canManage: boolean;
}

type ApiPayload = { error?: string; code?: string; ok?: boolean };

/**
 * FD-061 EX-4: seller configuration of quantity-tier offers. Trigger
 * product/variant/quantity -> reward product/variant/quantity or free
 * shipping; evaluation semantics (highest trigger wins, reward stock
 * checked) live in the service — this surface only writes configuration.
 */
export function StorefrontOffersManager({
  offers,
  storefronts,
  products,
  canManage,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { state: actionState, busy, run } = useManagerAction(canManage);
  const [pendingDelete, setPendingDelete] = useState<OfferRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    slug: storefronts[0]?.slug ?? "",
    triggerProductId: "",
    triggerQuantity: "2",
    rewardType: "free_shipping" as "free_shipping" | "product",
    rewardProductId: "",
    rewardQuantity: "1",
  });

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products],
  );

  async function createOffer(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      const response = await fetch("/api/storefront/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storefrontSlug: form.slug,
          triggerProductId: form.triggerProductId,
          triggerQuantity: Number(form.triggerQuantity),
          rewardType: form.rewardType,
          ...(form.rewardType === "product"
            ? {
                rewardProductId: form.rewardProductId,
                rewardQuantity: Number(form.rewardQuantity),
              }
            : {}),
        }),
      });
      const result = await settleResponse<ApiPayload>(response, t);
      if (!result.ok) return result;
      toast.success(t("storefronts.offers.createdToast"));
      setCreating(false);
      setForm((current) => ({ ...current, triggerProductId: "", rewardProductId: "" }));
      router.refresh();
      return { ok: true };
    });
  }

  async function removeOffer(offerId: string): Promise<void> {
    await run(async () => {
      const response = await fetch(`/api/storefront/offers/${encodeURIComponent(offerId)}`, { method: "DELETE" });
      const result = await settleResponse<ApiPayload>(response, t);
      if (!result.ok) return result;
      toast.success(t("storefronts.offers.deletedToast"));
      router.refresh();
      return { ok: true };
    });
  }

  if (storefronts.length === 0) return <ManagerNoStore />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4" />
          {t("storefronts.offers.title")}
        </CardTitle>
        <CardDescription>{t("storefronts.offers.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {offers.length === 0 ? (
          <ManagerEmpty
            title={t("storefront.studioStates.manager.offersEmptyTitle")}
            body={t("storefront.studioStates.manager.offersEmptyBody")}
          />
        ) : null}
        {offers.length > 0 ? (
          <ul className="max-h-96 space-y-2 overflow-y-auto pe-1" role="list">
            {offers.map((offer) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-surface border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {offer.triggerProductName}
                    {offer.triggerVariantId
                      ? ` · ${productById.get(offer.triggerVariantId) ?? offer.triggerVariantId}`
                      : ""}{" "}
                    ×{offer.triggerQuantity}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {offer.rewardType === "free_shipping" ? (
                      <>
                        <Truck className="h-3 w-3" aria-hidden="true" />
                        {t("storefronts.offers.rewardFreeShipping")}
                      </>
                    ) : (
                      <>
                        <Gift className="h-3 w-3" aria-hidden="true" />
                        {offer.rewardProductName} ×{offer.rewardQuantity}
                      </>
                    )}
                    {" · "}
                    {offer.storefrontSlug}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={offer.isActive ? "default" : "secondary"}>
                    {offer.isActive
                      ? t("storefronts.offers.active")
                      : t("storefronts.offers.inactive")}
                  </Badge>
                  {canManage ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive [@media(pointer:coarse)]:size-11"
                      disabled={busy}
                      onClick={() => setPendingDelete(offer)}
                      aria-label={t("storefronts.offers.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("storefronts.offers.empty")}</p>
        )}

        {canManage ? (
          creating ? (
            <form onSubmit={createOffer} className="space-y-3 rounded-surface border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="offer-slug">{t("storefronts.offers.storefront")}</Label>
                  <select
                    id="offer-slug"
                    value={form.slug}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, slug: event.target.value }))}
                    className="h-11 w-full rounded-control border bg-background px-3 text-sm"
                  >
                    {storefronts.map((storefront) => (
                      <option key={storefront.slug} value={storefront.slug}>
                        {storefront.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offer-trigger-product">{t("storefronts.offers.triggerProduct")}</Label>
                  <select
                    id="offer-trigger-product"
                    required
                    value={form.triggerProductId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, triggerProductId: event.target.value }))}
                    className="h-11 w-full rounded-control border bg-background px-3 text-sm"
                  >
                    <option value="">—</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offer-trigger-qty">{t("storefronts.offers.triggerQuantity")}</Label>
                  <Input
                    id="offer-trigger-qty"
                    type="number"
                    min={2}
                    max={999}
                    required
                    dir="ltr"
                    value={form.triggerQuantity}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, triggerQuantity: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offer-reward-type">{t("storefronts.offers.rewardType")}</Label>
                  <select
                    id="offer-reward-type"
                    value={form.rewardType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        rewardType: event.target.value as "free_shipping" | "product",
                      }))}
                    className="h-11 w-full rounded-control border bg-background px-3 text-sm"
                  >
                    <option value="free_shipping">{t("storefronts.offers.rewardFreeShipping")}</option>
                    <option value="product">{t("storefronts.offers.rewardProduct")}</option>
                  </select>
                </div>
                {form.rewardType === "product" ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="offer-reward-product">{t("storefronts.offers.rewardProduct")}</Label>
                      <select
                        id="offer-reward-product"
                        required
                        value={form.rewardProductId}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, rewardProductId: event.target.value }))}
                        className="h-11 w-full rounded-control border bg-background px-3 text-sm"
                      >
                        <option value="">—</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="offer-reward-qty">{t("storefronts.offers.rewardQuantity")}</Label>
                      <Input
                        id="offer-reward-qty"
                        type="number"
                        min={1}
                        max={999}
                        required
                        dir="ltr"
                        value={form.rewardQuantity}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, rewardQuantity: event.target.value }))}
                      />
                    </div>
                  </>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" className={MANAGER_TOUCH} disabled={busy}>
                  {busy ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="me-1 h-3.5 w-3.5" />}
                  {t("storefronts.offers.create")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCreating(false)}
                >
                  {t("storefronts.offers.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="outline" className={MANAGER_TOUCH} onClick={() => setCreating(true)}>
              <Plus className="me-1 h-3.5 w-3.5" />
              {t("storefronts.offers.create")}
            </Button>
          )
        ) : null}
        <ManagerSaveLine state={actionState} verb="remove" />
        {pendingDelete ? (
          <ConfirmDialog
            open
            onOpenChange={(open) => {
              if (!open) setPendingDelete(null);
            }}
            destructive
            title={t("storefront.studioStates.manager.offerDeleteTitle")}
            description={t("storefront.studioStates.manager.offerDeleteBody", {
              name: pendingDelete.triggerProductName,
              quantity: pendingDelete.triggerQuantity,
            })}
            confirmLabel={t("storefront.studioStates.manager.offerDeleteConfirm")}
            onConfirm={() => removeOffer(pendingDelete.id)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
