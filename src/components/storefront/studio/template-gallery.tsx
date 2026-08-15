"use client";

import { Check } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontTemplateId } from "@/lib/storefront/presentation-types";
import { cn } from "@/lib/utils";

const TEMPLATES: readonly {
  id: StorefrontTemplateId;
  nameKey: string;
  roleKey: string;
}[] = [
  {
    id: "atlas",
    nameKey: "storefront.studio.template.atlas",
    roleKey: "storefront.studio.template.atlasRole",
  },
  {
    id: "sahara",
    nameKey: "storefront.studio.template.sahara",
    roleKey: "storefront.studio.template.saharaRole",
  },
  {
    id: "oasis",
    nameKey: "storefront.studio.template.oasis",
    roleKey: "storefront.studio.template.oasisRole",
  },
] as const;

function TemplatePreview({ id }: { id: StorefrontTemplateId }) {
  return (
    <div
      className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border/70 bg-background shadow-inner"
      aria-hidden="true"
    >
      <div className="flex h-5 items-center justify-between border-b bg-card px-2">
        <span className="h-1.5 w-8 rounded-full bg-foreground/60" />
        <span className="flex gap-1">
          <span className="size-1.5 rounded-full bg-muted-foreground/35" />
          <span className="size-1.5 rounded-full bg-muted-foreground/35" />
          <span className="size-1.5 rounded-full bg-primary/70" />
        </span>
      </div>

      {id === "atlas" ? (
        <>
          <div className="grid h-[46%] grid-cols-[1.2fr_.8fr] gap-2 bg-gradient-to-br from-primary/16 via-primary/7 to-transparent p-2.5">
            <div className="flex flex-col justify-center gap-1.5">
              <span className="h-1.5 w-10 rounded-full bg-primary/55" />
              <span className="h-2 w-4/5 rounded-full bg-foreground/75" />
              <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/35" />
              <span className="mt-1 h-3 w-12 rounded bg-primary/80" />
            </div>
            <div className="rounded-md border bg-card/90 shadow-sm" />
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-2.5">
            <span className="h-8 rounded-md border bg-card" />
            <span className="h-8 rounded-md border bg-card" />
            <span className="h-8 rounded-md border bg-card" />
          </div>
        </>
      ) : id === "sahara" ? (
        <>
          <div className="flex h-[48%] flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-primary/10 to-transparent px-6 text-center">
            <span className="h-1.5 w-12 rounded-full bg-primary/55" />
            <span className="h-2 w-3/4 rounded-full bg-foreground/75" />
            <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/35" />
            <span className="mt-1 h-3 w-14 rounded-full bg-primary/80" />
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 py-2">
            <span className="h-8 rounded-lg border bg-card shadow-sm" />
            <span className="h-8 rounded-lg border bg-card shadow-sm" />
          </div>
        </>
      ) : (
        <>
          <div className="grid h-[45%] grid-cols-[.82fr_1.18fr] gap-2 p-2.5">
            <div className="rounded-xl bg-primary/14 ring-1 ring-primary/15" />
            <div className="flex flex-col justify-center gap-1.5">
              <span className="h-1.5 w-9 rounded-full bg-primary/55" />
              <span className="h-2 w-5/6 rounded-full bg-foreground/75" />
              <span className="h-1.5 w-2/3 rounded-full bg-muted-foreground/35" />
            </div>
          </div>
          <div className="mx-2.5 rounded-lg bg-muted/65 p-2">
            <div className="grid grid-cols-3 gap-1.5">
              <span className="h-7 rounded-md bg-background" />
              <span className="h-7 rounded-md bg-background" />
              <span className="h-7 rounded-md bg-background" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TemplateGallery({
  value,
  onChange,
}: {
  value: StorefrontTemplateId;
  onChange: (value: StorefrontTemplateId) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-2.5">
      {TEMPLATES.map(({ id, nameKey, roleKey }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            data-storefront-template-card={id}
            onClick={() => onChange(id)}
            className={cn(
              "group w-full rounded-xl border p-2.5 text-start outline-none transition-[border-color,background-color,box-shadow,transform]",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary/45 bg-primary/[0.055] shadow-sm"
                : "border-border/80 bg-card hover:-translate-y-px hover:border-primary/25 hover:bg-muted/30",
            )}
          >
            <TemplatePreview id={id} />
            <span className="mt-2.5 flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t(nameKey)}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                  {t(roleKey)}
                </span>
              </span>
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent group-hover:border-primary/35",
                )}
              >
                <Check className="size-3" />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
