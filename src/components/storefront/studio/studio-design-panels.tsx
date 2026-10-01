"use client";

import { useState } from "react";
import { Check, Package, Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontPalette } from "@/lib/storefront/storefront-tokens";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { switchStorefrontTemplate } from "@/lib/storefront/theme-normalize";
import { cn, formatDZD } from "@/lib/utils";

import { ColorField, PanelHeader, SegmentedField, TextAreaField, TextField } from "./studio-controls";
import { TemplateGallery } from "./template-gallery";
import { studioImageUrl, type StorefrontStudioProduct } from "./studio-types";

type Commit = (draft: StorefrontStudioDraft) => void;

/** Curated palettes: each passes 4.5:1 for body text and button labels. */
export const STOREFRONT_PALETTES: ReadonlyArray<{ id: string } & StorefrontPalette> = [
  { id: "emerald", primaryColor: "#166534", accentColor: "#F0A35E", backgroundColor: "#FFF8F1", surfaceColor: "#FFFFFF", textColor: "#211A17" },
  { id: "ocean", primaryColor: "#0369A1", accentColor: "#22D3EE", backgroundColor: "#F4F8FB", surfaceColor: "#FFFFFF", textColor: "#0F172A" },
  { id: "sunset", primaryColor: "#C2410C", accentColor: "#FACC15", backgroundColor: "#FFF7ED", surfaceColor: "#FFFFFF", textColor: "#27150C" },
  { id: "rose", primaryColor: "#BE185D", accentColor: "#F9A8D4", backgroundColor: "#FFF5F8", surfaceColor: "#FFFFFF", textColor: "#2A0E1B" },
  { id: "graphite", primaryColor: "#18181B", accentColor: "#A3E635", backgroundColor: "#FAFAFA", surfaceColor: "#FFFFFF", textColor: "#18181B" },
  { id: "night", primaryColor: "#F59E0B", accentColor: "#38BDF8", backgroundColor: "#0B1020", surfaceColor: "#141B2D", textColor: "#F1F5F9" },
];

export function ThemePanel({ draft, commit }: { draft: StorefrontStudioDraft; commit: Commit }) {
  const { t } = useI18n();
  const theme = draft.theme;
  const patchTheme = (patch: Partial<StorefrontStudioDraft["theme"]>) =>
    commit({ ...draft, theme: { ...theme, ...patch } });
  const option = <T extends string>(value: T) => ({ value, label: t(`storefront.studio.option.${value}`) });
  const activePalette = STOREFRONT_PALETTES.find(
    (palette) =>
      palette.primaryColor === theme.primaryColor.toUpperCase() &&
      palette.backgroundColor === theme.backgroundColor.toUpperCase(),
  )?.id;

  return (
    <div className="space-y-6">
      <section>
        <PanelHeader title={t("storefront.studio.templateTitle")} />
        <TemplateGallery
          value={theme.template}
          onChange={(template) => commit({ ...draft, theme: switchStorefrontTemplate(theme, template) })}
        />
      </section>

      <section className="space-y-4 border-t pt-5">
        <PanelHeader title={t("storefront.studio.brandTitle")} />
        <TextField label={t("storefront.builder.shopName")} value={draft.name} maxLength={100} onChange={(name) => commit({ ...draft, name })} />
        <TextAreaField label={t("storefront.builder.description")} value={draft.description} maxLength={500} onChange={(description) => commit({ ...draft, description })} />
      </section>

      <section className="space-y-4 border-t pt-5">
        <PanelHeader title={t("storefront.studio.paletteTitle")} />
        <div>
          <p className="mb-2 text-body-sm font-medium">{t("storefront.studio.palettes")}</p>
          <div className="grid grid-cols-3 gap-2">
            {STOREFRONT_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                aria-pressed={activePalette === palette.id}
                data-studio-palette={palette.id}
                onClick={() =>
                  patchTheme({
                    primaryColor: palette.primaryColor,
                    accentColor: palette.accentColor,
                    backgroundColor: palette.backgroundColor,
                    surfaceColor: palette.surfaceColor,
                    textColor: palette.textColor,
                  })
                }
                className={cn(
                  "relative rounded-control border p-1.5 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  activePalette === palette.id ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
                )}
              >
                <span className="flex h-7 overflow-hidden rounded-[6px]" style={{ background: palette.backgroundColor }} aria-hidden="true">
                  <span className="w-1/2" style={{ background: palette.primaryColor }} />
                  <span className="w-1/4" style={{ background: palette.accentColor }} />
                  <span className="w-1/4" style={{ background: palette.surfaceColor }} />
                </span>
                <span className="mt-1 block truncate text-caption font-medium">
                  {t(`storefront.studio.palette.${palette.id}`)}
                </span>
                {activePalette === palette.id ? (
                  <Check className="absolute end-1 top-1 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ColorField label={t("storefront.studio.color.primary")} value={theme.primaryColor} onChange={(primaryColor) => patchTheme({ primaryColor })} contrastWith={theme.backgroundColor} />
          <ColorField label={t("storefront.studio.color.accent")} value={theme.accentColor} onChange={(accentColor) => patchTheme({ accentColor })} />
          <ColorField label={t("storefront.studio.color.background")} value={theme.backgroundColor} onChange={(backgroundColor) => patchTheme({ backgroundColor })} />
          <ColorField label={t("storefront.studio.color.surface")} value={theme.surfaceColor} onChange={(surfaceColor) => patchTheme({ surfaceColor })} />
          <div className="col-span-2">
            <ColorField label={t("storefront.studio.color.text")} value={theme.textColor} onChange={(textColor) => patchTheme({ textColor })} contrastWith={theme.backgroundColor} />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t pt-5">
        <PanelHeader title={t("storefront.studio.styleTitle")} />
        <SegmentedField label={t("storefront.studio.radius")} value={theme.radius} options={[option("soft"), option("rounded"), option("sharp")]} onChange={(radius) => patchTheme({ radius })} />
        <SegmentedField label={t("storefront.studio.density")} value={theme.density} options={[option("airy"), option("balanced"), option("compact")]} onChange={(density) => patchTheme({ density })} />
        <SegmentedField label={t("storefront.studio.cardStyle")} value={theme.catalog.cardStyle} options={[option("minimal"), option("elevated"), option("outlined")]} onChange={(cardStyle) => patchTheme({ catalog: { ...theme.catalog, cardStyle } })} />
        <SegmentedField label={t("storefront.studio.imageRatio")} value={theme.catalog.imageRatio} options={[option("square"), option("portrait"), option("landscape")]} onChange={(imageRatio) => patchTheme({ catalog: { ...theme.catalog, imageRatio } })} />
      </section>
    </div>
  );
}

/** The catalog of this store: which active products it sells. */
export function ProductsPanel({
  products,
  selected,
  onChange,
  onSetAll,
}: {
  products: readonly StorefrontStudioProduct[];
  selected: readonly string[];
  onChange: (id: string, selected: boolean) => void;
  onSetAll: (ids: string[]) => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const visible = products.filter(
    (product) =>
      !needle ||
      product.name.toLocaleLowerCase().includes(needle) ||
      (product.sku ?? "").toLocaleLowerCase().includes(needle),
  );

  if (products.length === 0) {
    return (
      <div className="space-y-2">
        <PanelHeader title={t("storefront.studio.panels.products")} />
        <p className="text-body-sm text-muted-foreground">{t("storefront.builder.noActiveProducts")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PanelHeader title={t("storefront.studio.panels.products")} />
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("storefront.studio.searchProducts")} aria-label={t("storefront.studio.searchProducts")} className="ps-9" />
      </div>
      <div className="flex items-center justify-between text-caption">
        <span className="font-medium text-muted-foreground">
          {t("storefront.studio.selectedCount", { count: selected.length })}
        </span>
        <span className="flex gap-3">
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => onSetAll(products.map((product) => product.id))}>
            {t("storefront.studio.selectAll")}
          </button>
          <button type="button" className="font-medium text-muted-foreground hover:text-foreground hover:underline" onClick={() => onSetAll([])}>
            {t("storefront.studio.clearSelection")}
          </button>
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-muted-foreground">{t("storefront.studio.noProductMatch")}</p>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {visible.map((product) => {
            const image = studioImageUrl(product.images);
            const checked = selected.includes(product.id);
            return (
              <li key={product.id}>
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-control p-1.5 transition-colors hover:bg-muted", checked && "bg-primary-subtle")}>
                  <Checkbox checked={checked} onCheckedChange={(value) => onChange(product.id, value === true)} aria-label={product.name} />
                  <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control border bg-muted text-muted-foreground">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- seller product media
                      <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
                    ) : (
                      <Package className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-body-sm font-medium">{product.name}</span>
                    <span className="block text-caption text-muted-foreground">
                      {formatDZD(product.price, locale)} · {t("storefront.studio.stockCount", { count: product.stock })}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
