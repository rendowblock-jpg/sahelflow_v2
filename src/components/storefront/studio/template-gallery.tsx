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
    id: "noir",
    nameKey: "storefront.studio.template.noir",
    roleKey: "storefront.studio.template.noirRole",
  },
  {
    id: "lumen",
    nameKey: "storefront.studio.template.lumen",
    roleKey: "storefront.studio.template.lumenRole",
  },
  {
    id: "atelier",
    nameKey: "storefront.studio.template.atelier",
    roleKey: "storefront.studio.template.atelierRole",
  },
  {
    id: "pulse",
    nameKey: "storefront.studio.template.pulse",
    roleKey: "storefront.studio.template.pulseRole",
  },
  {
    id: "bloom",
    nameKey: "storefront.studio.template.bloom",
    roleKey: "storefront.studio.template.bloomRole",
  },
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
  {
    id: "prime",
    nameKey: "storefront.studio.template.prime",
    roleKey: "storefront.studio.template.primeRole",
  },
  {
    id: "souk",
    nameKey: "storefront.studio.template.souk",
    roleKey: "storefront.studio.template.soukRole",
  },
  {
    id: "reel",
    nameKey: "storefront.studio.template.reel",
    roleKey: "storefront.studio.template.reelRole",
  },
] as const;

function TemplatePreview({ id }: { id: StorefrontTemplateId }) {
  return (
    <div
      className="relative aspect-[16/10] overflow-hidden rounded-surface border border-border/70 bg-background shadow-inner"
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
          <div className="grid h-[46%] grid-cols-[1.2fr_.8fr] gap-2 bg-gradient-to-br from-primary-strong via-primary-soft to-transparent p-2.5">
            <div className="flex flex-col justify-center gap-1.5">
              <span className="h-1.5 w-10 rounded-full bg-primary/55" />
              <span className="h-2 w-4/5 rounded-full bg-foreground/75" />
              <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/35" />
              <span className="mt-1 h-3 w-12 rounded-control bg-primary/80" />
            </div>
            <div className="rounded-control border bg-card/90 shadow-sm" />
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-2.5">
            <span className="h-8 rounded-control border bg-card" />
            <span className="h-8 rounded-control border bg-card" />
            <span className="h-8 rounded-control border bg-card" />
          </div>
        </>
      ) : id === "sahara" ? (
        <>
          <div className="flex h-[48%] flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-primary-soft to-transparent px-6 text-center">
            <span className="h-1.5 w-12 rounded-full bg-primary/55" />
            <span className="h-2 w-3/4 rounded-full bg-foreground/75" />
            <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/35" />
            <span className="mt-1 h-3 w-14 rounded-full bg-primary/80" />
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 py-2">
            <span className="h-8 rounded-surface border bg-card shadow-sm" />
            <span className="h-8 rounded-surface border bg-card shadow-sm" />
          </div>
        </>
      ) : id === "prime" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-[#07120e]">
          <div className="absolute inset-x-0 top-0 h-[62%] bg-[radial-gradient(60%_80%_at_50%_30%,#2d6350,transparent)]" />
          <span className="absolute start-1/2 top-[14%] h-[40%] w-[14%] -translate-x-1/2 rounded-t-md rounded-b-sm bg-[#efeae0]/90 rtl:translate-x-1/2" />
          <span className="absolute inset-x-[30%] bottom-[22%] h-1.5 rounded-full bg-[#efeae0]/80" />
          <span className="absolute inset-x-[38%] bottom-[8%] h-3 rounded-full bg-[#c8a25b]" />
        </div>
      ) : id === "noir" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-[#0f0e0d]">
          <span className="absolute left-1/2 top-3 h-14 w-14 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#d9c7a3_0%,#8a7650_38%,transparent_70%)] opacity-90" />
          <span className="absolute inset-x-8 bottom-4 h-1.5 rounded-full bg-[#f1ebdf]/80" />
          <span className="absolute inset-x-14 bottom-2 h-1 rounded-full bg-[#d9c7a3]/60" />
        </div>
      ) : id === "lumen" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-[#f2f4f5] p-2.5">
          <span className="block h-7 w-1/2 rounded-sm bg-[#0e1114]" />
          <div className="mt-2 space-y-1">
            <span className="flex gap-1"><span className="h-1.5 w-4 bg-[#d93a0b]" /><span className="h-1.5 flex-1 bg-[#0e1114]/20" /></span>
            <span className="flex gap-1"><span className="h-1.5 w-4 bg-[#0e1114]/40" /><span className="h-1.5 flex-1 bg-[#0e1114]/20" /></span>
            <span className="flex gap-1"><span className="h-1.5 w-4 bg-[#0e1114]/40" /><span className="h-1.5 flex-1 bg-[#0e1114]/20" /></span>
          </div>
        </div>
      ) : id === "atelier" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-[#f2e9da]">
          <span className="absolute start-3 top-3 h-12 w-12 rotate-[-4deg] rounded-sm bg-[#a9461f]/80" />
          <span className="absolute start-14 top-5 h-12 w-14 rotate-[3deg] rounded-sm bg-[#5e6b3a]/70" />
          <span className="absolute inset-x-3 bottom-3 h-1.5 rounded-full bg-[#2a1f18]/70" />
          <span className="absolute bottom-5 end-3 h-1.5 w-1/4 rounded-full bg-[#2a1f18]/30" />
        </div>
      ) : id === "pulse" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-[#ddf93a]">
          <span className="absolute inset-x-0 top-0 h-2.5 bg-[#0b0b0b]" />
          <span className="absolute inset-x-2 top-5 h-4 bg-[#0b0b0b]" />
          <span className="absolute inset-x-2 top-10 h-4 w-2/3 bg-[#0b0b0b]" />
          <span className="absolute bottom-2 end-3 size-7 rotate-12 rounded-full bg-[#e5271b]" />
        </div>
      ) : id === "bloom" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-[#fcf0eb]">
          <span className="absolute start-1/2 top-3 h-16 w-12 -translate-x-1/2 rounded-t-full bg-[#f2b8a2]" />
          <span className="absolute inset-x-10 bottom-3 h-3 rounded-full bg-[#b73a62]" />
        </div>
      ) : id === "souk" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-white p-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            <span className="h-11 rounded-control bg-[#d3e0be]" />
            <span className="h-11 rounded-control bg-[#f6d5c4]" />
            <span className="h-11 rounded-control bg-[#d9d0f0]" />
            <span className="h-11 rounded-control bg-[#f7e8b0]" />
            <span className="h-11 rounded-control bg-[#f3cfd6]" />
            <span className="h-11 rounded-control bg-[#cfe3f0]" />
          </div>
          <span className="absolute inset-x-2.5 bottom-1.5 h-2 rounded-full bg-[#15172a]" />
        </div>
      ) : id === "reel" ? (
        <div className="absolute inset-x-0 bottom-0 top-5 bg-[#09090a] px-2 pt-2.5">
          <div className="flex gap-1.5">
            <span className="h-14 w-[38%] shrink-0 rounded-sm border border-white/15 bg-white/10" />
            <span className="h-14 w-[38%] shrink-0 rounded-sm border border-white/30 bg-white/20" />
            <span className="h-14 w-[38%] shrink-0 rounded-sm border border-white/15 bg-white/10" />
          </div>
          <span className="mt-2 block h-2.5 w-2/3 rounded-sm bg-[#f1efea]" />
          <span className="mt-1.5 block h-1.5 w-1/3 rounded-full bg-[#f1efea]/40" />
        </div>
      ) : (
        <>
          <div className="grid h-[45%] grid-cols-[.82fr_1.18fr] gap-2 p-2.5">
            <div className="rounded-surface bg-primary-strong ring-1 ring-primary/15" />
            <div className="flex flex-col justify-center gap-1.5">
              <span className="h-1.5 w-9 rounded-full bg-primary/55" />
              <span className="h-2 w-5/6 rounded-full bg-foreground/75" />
              <span className="h-1.5 w-2/3 rounded-full bg-muted-foreground/35" />
            </div>
          </div>
          <div className="mx-2.5 rounded-surface bg-muted/65 p-2">
            <div className="grid grid-cols-3 gap-1.5">
              <span className="h-7 rounded-control bg-background" />
              <span className="h-7 rounded-control bg-background" />
              <span className="h-7 rounded-control bg-background" />
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
              "group w-full rounded-surface border p-2.5 text-start outline-none transition-[border-color,background-color,box-shadow,transform]",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary/45 bg-primary-subtle shadow-sm"
                : "border-border/80 bg-card hover:-translate-y-px hover:border-primary/25 hover:bg-muted/30",
            )}
          >
            <TemplatePreview id={id} />
            <span className="mt-2.5 flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t(nameKey)}</span>
                <span className="mt-0.5 block text-caption leading-4 text-muted-foreground">
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
