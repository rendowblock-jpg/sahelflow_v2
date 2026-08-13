"use client";

import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { StorefrontSection, StorefrontSectionType } from "@/lib/storefront/studio-sections";

const LABELS: Record<StorefrontSectionType, string> = {
  announcement: "Announcement",
  navbar: "Navigation",
  hero: "Hero",
  trust: "Trust badges",
  "featured-products": "Featured products",
  "product-grid": "Product grid",
  categories: "Categories",
  media: "Media",
  testimonials: "Testimonials",
  faq: "FAQ",
  "cod-checkout": "COD checkout",
  support: "Support",
  footer: "Footer",
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
  return (
    <div className="space-y-2">
      <div className="space-y-1" role="list" aria-label="Storefront sections">
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
                {LABELS[section.type]}
              </button>
              <TreeAction label="Move up" disabled={index === 0} onClick={() => onMove(section.id, -1)}>
                <ChevronUp />
              </TreeAction>
              <TreeAction label="Move down" disabled={index === sections.length - 1} onClick={() => onMove(section.id, 1)}>
                <ChevronDown />
              </TreeAction>
              <TreeAction label={section.enabled ? "Hide section" : "Show section"} onClick={() => onToggle(section.id)}>
                {section.enabled ? <Eye /> : <EyeOff />}
              </TreeAction>
            </div>
            {selected === section.id ? (
              <div className="flex gap-1 border-t px-1 pt-1.5">
                <TreeAction label="Duplicate section" onClick={() => onDuplicate(section.id)}>
                  <Copy />
                </TreeAction>
                <TreeAction label="Delete section" disabled={sections.length === 1} onClick={() => onDelete(section.id)}>
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
        <Plus className="h-3.5 w-3.5" /> Add section
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
