"use client";

import {
  Layers,
  Package,
  Palette,
  Phone,
  Search,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export type StudioPanel =
  | "sections"
  | "theme"
  | "products"
  | "checkout"
  | "contact"
  | "seo";

export const STUDIO_PANELS: ReadonlyArray<{
  id: StudioPanel;
  labelKey: string;
  icon: LucideIcon;
}> = [
  { id: "sections", labelKey: "storefront.studio.panels.sections", icon: Layers },
  { id: "theme", labelKey: "storefront.studio.panels.theme", icon: Palette },
  { id: "products", labelKey: "storefront.studio.panels.products", icon: Package },
  { id: "checkout", labelKey: "storefront.studio.panels.checkout", icon: Truck },
  { id: "contact", labelKey: "storefront.studio.panels.contact", icon: Phone },
  { id: "seo", labelKey: "storefront.studio.panels.seo", icon: Search },
];

/**
 * The Studio's left icon rail. Choosing the open panel again collapses it,
 * giving the canvas the full width.
 */
export function StudioRail({
  panel,
  collapsed,
  onSelect,
  badges,
}: {
  panel: StudioPanel;
  collapsed: boolean;
  onSelect: (panel: StudioPanel) => void;
  badges?: Partial<Record<StudioPanel, boolean>>;
}) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("storefront.studio.panelsLabel")}
      data-studio-rail="true"
      className="flex w-16 shrink-0 flex-col items-center gap-1 border-e bg-background py-2"
    >
      {STUDIO_PANELS.map(({ id, labelKey, icon: Icon }) => {
        const active = panel === id && !collapsed;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            title={t(labelKey)}
            data-studio-rail-item={id}
            onClick={() => onSelect(id)}
            className={cn(
              "relative flex w-14 flex-col items-center gap-1 rounded-control px-1 py-2 text-[11px] font-medium leading-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary-subtle text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            <span className="w-full truncate text-center">{t(`storefront.studio.rail.${id}`)}</span>
            {badges?.[id] ? (
              <span
                className="absolute end-2.5 top-1.5 size-2 rounded-full bg-warning ring-2 ring-background"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
