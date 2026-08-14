"use client";

import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontSection, StorefrontSectionType } from "@/lib/storefront/studio-sections";

export const SECTION_LABEL_KEYS: Record<StorefrontSectionType, string> = {
  announcement: "storefront.studio.section.announcement",
  navbar: "storefront.studio.section.navbar",
  hero: "storefront.studio.section.hero",
  trust: "storefront.studio.section.trust",
  "featured-products": "storefront.studio.section.featuredProducts",
  "product-grid": "storefront.studio.section.productGrid",
  categories: "storefront.studio.section.categories",
  media: "storefront.studio.section.media",
  testimonials: "storefront.studio.section.testimonials",
  faq: "storefront.studio.section.faq",
  "cod-checkout": "storefront.studio.section.codCheckout",
  support: "storefront.studio.section.support",
  footer: "storefront.studio.section.footer",
};

type Props = {
  sections: readonly StorefrontSection[];
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggle: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
};

export function SectionTree({
  sections,
  selected,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onDelete,
  onAdd,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="space-y-1" role="list" aria-label={t("storefront.studio.sectionsLabel")}>
        {sections.map((section, index) => (
          <div
            key={section.id}
            role="listitem"
            className={`group rounded-xl border p-1.5 transition-colors ${
              selected === section.id ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-start text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-current={selected === section.id ? "true" : undefined}
              >
                {t(SECTION_LABEL_KEYS[section.type])}
              </button>
              <TreeAction label={t("storefront.studio.moveUp")} disabled={index === 0} onClick={() => onMove(section.id, -1)}>
                <ChevronUp />
              </TreeAction>
              <TreeAction label={t("storefront.studio.moveDown")} disabled={index === sections.length - 1} onClick={() => onMove(section.id, 1)}>
                <ChevronDown />
              </TreeAction>
              <TreeAction label={t(section.enabled ? "storefront.studio.hideSection" : "storefront.studio.showSection")} onClick={() => onToggle(section.id)}>
                {section.enabled ? <Eye /> : <EyeOff />}
              </TreeAction>
            </div>
            {selected === section.id ? (
              <div className="flex gap-1 border-t px-1 pt-1.5">
                <TreeAction label={t("storefront.studio.duplicateSection")} onClick={() => onDuplicate(section.id)}>
                  <Copy />
                </TreeAction>
                <TreeAction label={t("storefront.studio.deleteSection")} disabled={sections.length === 1} onClick={() => onDelete(section.id)}>
                  <Trash2 />
                </TreeAction>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> {t("storefront.studio.addSection")}
      </button>
    </div>
  );
}

function TreeAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      {children}
    </button>
  );
}
