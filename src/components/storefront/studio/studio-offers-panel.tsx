"use client";

import { useState } from "react";
import { AlertTriangle, Percent, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import {
  MAX_OFFER_QUANTITY,
  MAX_OFFER_TIERS,
  normalizeStorefrontOffers,
  percentOffTotal,
  saleItemsFromStudioProducts,
  validateItemOfferLadder,
  type OfferTier,
  type StorefrontDraftOffers,
} from "@/lib/storefront/studio-offers";
import { PanelHeader } from "./studio-controls";
import type { StorefrontStudioDraft, StorefrontStudioProduct } from "./studio-types";

function formatDzd(value: number): string {
  return `${value.toLocaleString("en-US")} DA`;
}

export function StudioOffersPanel({
  draft,
  products,
  commit,
}: {
  draft: StorefrontStudioDraft;
  products: readonly StorefrontStudioProduct[];
  commit: (next: StorefrontStudioDraft) => void;
}) {
  const { t } = useI18n();
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>({});
  const saleItems = saleItemsFromStudioProducts(products, draft.selectedProductIds);

  function updateItemTiers(itemKey: string, nextTiers: OfferTier[]) {
    const base: StorefrontDraftOffers = { ...(draft.offers ?? {}) };
    if (nextTiers.length === 0) {
      delete base[itemKey];
    } else {
      base[itemKey] = nextTiers;
    }
    const normalized = normalizeStorefrontOffers(base);
    if (!normalized) {
      const { offers: _removed, ...rest } = draft;
      commit(rest);
    } else {
      commit({ ...draft, offers: normalized });
    }
  }

  function addTier(itemKey: string, unitPrice: number, current: readonly OfferTier[]) {
    if (current.length >= MAX_OFFER_TIERS) return;
    const nextQty = Math.min(
      MAX_OFFER_QUANTITY,
      current.length > 0 ? current[current.length - 1]!.q + 1 : 2,
    );
    const defaultTotal =
      percentOffTotal(unitPrice, nextQty, 10) ?? Math.max(0, nextQty * unitPrice - 1);
    updateItemTiers(itemKey, [...current, { q: nextQty, t: defaultTotal }]);
  }

  function patchTier(
    itemKey: string,
    current: readonly OfferTier[],
    index: number,
    patch: Partial<OfferTier>,
  ) {
    const next = current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier));
    updateItemTiers(itemKey, next);
  }

  function removeTier(itemKey: string, current: readonly OfferTier[], index: number) {
    updateItemTiers(
      itemKey,
      current.filter((_, i) => i !== index),
    );
  }

  function applyPercentShortcut(
    itemKey: string,
    unitPrice: number,
    current: readonly OfferTier[],
    index: number,
    rawPercent: string,
  ) {
    const pct = Number.parseInt(rawPercent, 10);
    const tier = current[index];
    if (!tier || !Number.isSafeInteger(pct) || pct < 1 || pct > 99) return;
    const total = percentOffTotal(unitPrice, tier.q, pct);
    if (total === null) return;
    patchTier(itemKey, current, index, { t: total });
  }

  return (
    <div className="space-y-4" data-offers-panel="true">
      <PanelHeader title={t("storefront.offersPanel.title")} />
      <p className="text-xs leading-5 text-muted-foreground">
        {t("storefront.offersPanel.intro")}
      </p>

      {saleItems.length === 0 ? (
        <p className="rounded-control border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {t("storefront.offersPanel.noProducts")}
        </p>
      ) : (
        <div className="space-y-3">
          {saleItems.map((item) => {
            const tiers = draft.offers?.[item.itemKey] ?? [];
            const validation = validateItemOfferLadder(item.unitPrice, tiers);
            const hasIssue = !validation.ok;

            return (
              <section
                key={item.itemKey}
                data-offer-item={item.itemKey}
                className="space-y-2.5 rounded-control border bg-surface/40 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold text-foreground">
                      {item.label}
                    </h3>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {t("storefront.offersPanel.unitPrice", {
                        price: formatDzd(item.unitPrice),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={tiers.length >= MAX_OFFER_TIERS || item.unitPrice <= 0}
                    onClick={() => addTier(item.itemKey, item.unitPrice, tiers)}
                    data-offer-add={item.itemKey}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-control border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-40"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    <span>{t("storefront.offersPanel.addTier")}</span>
                  </button>
                </div>

                {hasIssue ? (
                  <div
                    role="alert"
                    data-offer-error={validation.reason}
                    className="flex items-start gap-1.5 rounded-control border border-warning/40 bg-warning-soft px-2 py-1.5 text-[11px] text-foreground"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                    <span>
                      {validation.reason === "stale_price"
                        ? t("storefront.offersPanel.staleItemNotice")
                        : t("storefront.offersPanel.invalidItemNotice")}
                    </span>
                  </div>
                ) : null}

                {tiers.length > 0 ? (
                  <div className="space-y-2">
                    {tiers.map((tier, index) => {
                      const normalTotal = tier.q * item.unitPrice;
                      const savings = normalTotal - tier.t;
                      const rowValid =
                        Number.isSafeInteger(tier.q) &&
                        tier.q >= 2 &&
                        tier.q <= MAX_OFFER_QUANTITY &&
                        (index === 0 || tier.q > tiers[index - 1]!.q) &&
                        Number.isSafeInteger(tier.t) &&
                        tier.t >= 0 &&
                        tier.t < normalTotal;
                      const pctKey = `${item.itemKey}:${index}`;
                      const pctValue = percentInputs[pctKey] ?? "";

                      return (
                        <div
                          key={index}
                          data-offer-tier={`${item.itemKey}:${index}`}
                          className="space-y-1.5 rounded-control border bg-background p-2"
                        >
                          <div className="grid grid-cols-[1fr_1.4fr_auto] items-end gap-1.5">
                            <label className="space-y-0.5 text-[11px]">
                              <span className="block text-muted-foreground">
                                {t("storefront.offersPanel.quantityLabel")}
                              </span>
                              <input
                                type="number"
                                min={2}
                                max={MAX_OFFER_QUANTITY}
                                value={tier.q}
                                aria-label={t("storefront.offersPanel.quantityLabel")}
                                onChange={(event) => {
                                  const nextQ = Number.parseInt(event.target.value, 10);
                                  if (Number.isFinite(nextQ)) {
                                    patchTier(item.itemKey, tiers, index, { q: nextQ });
                                  }
                                }}
                                className="h-8 w-full rounded-control border bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            </label>
                            <label className="space-y-0.5 text-[11px]">
                              <span className="block text-muted-foreground">
                                {t("storefront.offersPanel.totalLabel")}
                              </span>
                              <input
                                type="number"
                                min={0}
                                value={tier.t}
                                aria-label={t("storefront.offersPanel.totalLabel")}
                                onChange={(event) => {
                                  const nextT = Number.parseInt(event.target.value, 10);
                                  if (Number.isFinite(nextT)) {
                                    patchTier(item.itemKey, tiers, index, { t: nextT });
                                  }
                                }}
                                className="h-8 w-full rounded-control border bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeTier(item.itemKey, tiers, index)}
                              aria-label={t("storefront.offersPanel.removeTier")}
                              className="inline-flex size-8 items-center justify-center rounded-control border text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <div className="relative flex flex-1 items-center">
                              <Percent className="pointer-events-none absolute start-2 size-3 text-muted-foreground" aria-hidden="true" />
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={pctValue}
                                placeholder={t("storefront.offersPanel.percentPlaceholder")}
                                aria-label={t("storefront.offersPanel.percentLabel")}
                                onChange={(event) =>
                                  setPercentInputs((prev) => ({
                                    ...prev,
                                    [pctKey]: event.target.value,
                                  }))
                                }
                                className="h-7 w-full rounded-control border bg-background pe-2 ps-6 text-[11px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            </div>
                            <button
                              type="button"
                              data-offer-apply-pct={pctKey}
                              onClick={() =>
                                applyPercentShortcut(
                                  item.itemKey,
                                  item.unitPrice,
                                  tiers,
                                  index,
                                  pctValue,
                                )
                              }
                              className="h-7 shrink-0 rounded-control border bg-muted/60 px-2 text-[11px] font-medium hover:bg-muted"
                            >
                              {t("storefront.offersPanel.applyPercent")}
                            </button>
                          </div>

                          <p
                            data-offer-preview={pctKey}
                            className={
                              rowValid
                                ? "text-[11px] tabular-nums text-muted-foreground"
                                : "text-[11px] font-medium text-warning"
                            }
                          >
                            {rowValid
                              ? t("storefront.offersPanel.buyerPaysPreview", {
                                  count: tier.q,
                                  total: formatDzd(tier.t),
                                  savings: formatDzd(savings),
                                })
                              : t("storefront.offersPanel.tierMustBeCheaper", {
                                  normal: formatDzd(normalTotal),
                                })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
