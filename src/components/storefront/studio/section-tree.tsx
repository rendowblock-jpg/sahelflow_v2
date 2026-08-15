"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import type {
  StorefrontSection,
  StorefrontSectionType,
} from "@/lib/storefront/studio-sections";
import { cn } from "@/lib/utils";

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
  onReorder: (id: string, targetIndex: number) => void;
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
  onReorder,
  onToggle,
  onDuplicate,
  onDelete,
  onAdd,
}: Props) {
  const { t } = useI18n();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const clearDrag = () => {
    setDraggingId(null);
    setDropIndex(null);
  };

  return (
    <div className="space-y-2.5">
      <div
        className="space-y-1.5"
        role="list"
        aria-label={t("storefront.studio.sectionsLabel")}
      >
        {sections.map((section, index) => {
          const active = selected === section.id;
          const dragging = draggingId === section.id;
          const dropTarget =
            draggingId !== null && draggingId !== section.id && dropIndex === index;
          return (
            <div
              key={section.id}
              role="listitem"
              draggable
              data-storefront-section-row={section.id}
              data-storefront-section-type={section.type}
              data-dragging={dragging ? "true" : undefined}
              data-drop-target={dropTarget ? "true" : undefined}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", section.id);
                setDraggingId(section.id);
                setDropIndex(index);
              }}
              onDragOver={(event) => {
                if (!draggingId || draggingId === section.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || draggingId;
                if (id && id !== section.id) onReorder(id, index);
                clearDrag();
              }}
              onDragEnd={clearDrag}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-background transition-[border-color,background-color,box-shadow,opacity,transform]",
                active
                  ? "border-primary/45 bg-primary/[0.04] shadow-sm"
                  : "border-border/75 hover:border-primary/20 hover:bg-muted/30",
                !section.enabled && "opacity-65",
                dragging && "scale-[0.985] opacity-55",
                dropTarget && "border-primary bg-primary/[0.07] shadow-sm",
              )}
            >
              {active || dropTarget ? (
                <span
                  className="absolute inset-block-2 start-0 w-0.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}

              <div className="flex min-w-0 items-center gap-1 px-1.5 py-1.5">
                <span
                  className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 active:cursor-grabbing"
                  title={t("storefront.studio.sectionsLabel")}
                  aria-hidden="true"
                >
                  <GripVertical className="size-3.5" />
                </span>

                <button
                  type="button"
                  onClick={() => onSelect(section.id)}
                  onKeyDown={(event) => {
                    if (!event.altKey) return;
                    if (event.key === "ArrowUp" && index > 0) {
                      event.preventDefault();
                      onMove(section.id, -1);
                    }
                    if (event.key === "ArrowDown" && index < sections.length - 1) {
                      event.preventDefault();
                      onMove(section.id, 1);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-current={active ? "true" : undefined}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {t(SECTION_LABEL_KEYS[section.type])}
                    </span>
                    {!section.enabled ? (
                      <EyeOff
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                </button>

                <TreeAction
                  label={t(
                    section.enabled
                      ? "storefront.studio.hideSection"
                      : "storefront.studio.showSection",
                  )}
                  onClick={() => onToggle(section.id)}
                >
                  {section.enabled ? <Eye /> : <EyeOff />}
                </TreeAction>
              </div>

              {active ? (
                <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/15 px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <TreeAction
                      label={t("storefront.studio.moveUp")}
                      disabled={index === 0}
                      onClick={() => onMove(section.id, -1)}
                    >
                      <ChevronUp />
                    </TreeAction>
                    <TreeAction
                      label={t("storefront.studio.moveDown")}
                      disabled={index === sections.length - 1}
                      onClick={() => onMove(section.id, 1)}
                    >
                      <ChevronDown />
                    </TreeAction>
                    <TreeAction
                      label={t("storefront.studio.duplicateSection")}
                      onClick={() => onDuplicate(section.id)}
                    >
                      <Copy />
                    </TreeAction>
                  </div>
                  <TreeAction
                    label={t("storefront.studio.deleteSection")}
                    disabled={sections.length === 1}
                    destructive
                    onClick={() => onDelete(section.id)}
                  >
                    <Trash2 />
                  </TreeAction>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground outline-none transition-[border-color,background-color,color] hover:border-primary/45 hover:bg-primary/[0.035] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        {t("storefront.studio.addSection")}
      </button>
    </div>
  );
}

function TreeAction({
  label,
  disabled,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
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
      className={cn(
        "flex size-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5",
        destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
