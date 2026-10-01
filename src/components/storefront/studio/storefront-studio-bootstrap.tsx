"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Monitor,
  Smartphone,
  Sparkles,
  Tablet,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import type {
  StorefrontShippingRule,
  StorefrontTemplateId,
} from "@/lib/storefront/presentation-types";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import wilayasData from "../../../../data/wilayas.json";

import { StudioCanvas } from "./studio-canvas";
import { TextAreaField, TextField } from "./studio-controls";
import { ProductsPanel, STOREFRONT_PALETTES } from "./studio-design-panels";
import { TemplateGallery } from "./template-gallery";
import type { StorefrontStudioDevice, StorefrontStudioProduct } from "./studio-types";

interface Props {
  products: StorefrontStudioProduct[];
}

type Step = "brand" | "look" | "products" | "delivery";
const STEPS: readonly Step[] = ["brand", "look", "products", "delivery"];

/** Template names as the gallery and preview badge show them. */
const TEMPLATE_COPY: Record<StorefrontTemplateId, string> = {
  sahara: "storefront.studio.template.sahara",
  atlas: "storefront.studio.template.atlas",
  oasis: "storefront.studio.template.oasis",
};

const WILAYA_CODES = (wilayasData as Array<{ code: number }>).map((wilaya) =>
  String(wilaya.code).padStart(2, "0"),
);
const MAX_FEE = 100000;
const CURRENCY = "DZD";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function fee(raw: string): number | null {
  if (raw.trim() === "") return null;
  return Math.max(0, Math.min(MAX_FEE, Math.round(Number(raw) || 0)));
}

/**
 * New store setup: four short steps beside a live preview of the real store,
 * ending in the same Studio that owns composition and publish. The created
 * store stays private (`isActive: false`) until the seller publishes.
 */
export function StorefrontStudioBootstrap({ products }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("brand");
  const [attempted, setAttempted] = useState<Partial<Record<Step, boolean>>>({});
  const [device, setDevice] = useState<StorefrontStudioDevice>("desktop");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<StorefrontTemplateId>("atlas");
  const [paletteId, setPaletteId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [homeFee, setHomeFee] = useState("");
  const [deskFee, setDeskFee] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const contact = useMemo(
    () => ({ phone, whatsapp, email, address }),
    [address, email, phone, whatsapp],
  );
  const shippingRules = useMemo<StorefrontShippingRule[]>(() => {
    const rules: StorefrontShippingRule[] = [];
    for (const [deliveryMode, raw] of [["home", homeFee], ["desk", deskFee]] as const) {
      const feeDzd = fee(raw);
      if (feeDzd === null) continue;
      for (const wilayaCode of WILAYA_CODES) rules.push({ wilayaCode, deliveryMode, feeDzd });
    }
    return rules;
  }, [deskFee, homeFee]);
  const theme = useMemo(() => {
    const next = createDefaultStorefrontTheme(template);
    const palette = STOREFRONT_PALETTES.find((candidate) => candidate.id === paletteId);
    if (palette) {
      next.primaryColor = palette.primaryColor;
      next.accentColor = palette.accentColor;
      next.backgroundColor = palette.backgroundColor;
      next.surfaceColor = palette.surfaceColor;
      next.textColor = palette.textColor;
    }
    next.builder.contact = contact;
    next.builder.shippingRules = shippingRules;
    return next;
  }, [contact, paletteId, shippingRules, template]);
  const draft = useMemo<StorefrontStudioDraft>(
    () => ({
      name: name.trim() || t("storefront.builder.shopNamePlaceholder"),
      slug: slug.trim() || "your-store",
      description,
      theme,
      selectedProductIds,
      // A private preview of the first publish intent; the public config is
      // created inactive and only goes live through the Studio publish.
      isActive: true,
      version: null,
    }),
    [description, name, selectedProductIds, slug, t, theme],
  );

  const errors: Record<Step, string | null> = {
    brand: !name.trim()
      ? t("storefront.builder.error.nameRequired")
      : slug.trim().length < 2
        ? t("storefront.builder.error.slugRequired")
        : !/^[a-z0-9-]+$/.test(slug)
          ? t("storefront.builder.error.slugFormat")
          : null,
    look: null,
    products: selectedProductIds.length === 0 ? t("storefront.builder.error.productRequired") : null,
    delivery: null,
  };
  const index = STEPS.indexOf(step);
  const last = index === STEPS.length - 1;
  const reachable = (target: Step) =>
    STEPS.indexOf(target) <= index ||
    STEPS.slice(0, STEPS.indexOf(target)).every((candidate) => !errors[candidate]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug((current) => (current === slugify(name) || current === "" ? slugify(value) : current));
  }

  function next() {
    if (errors[step]) {
      setAttempted((current) => ({ ...current, [step]: true }));
      return;
    }
    const following = STEPS[index + 1];
    if (following) setStep(following);
  }

  function createAndOpenStudio() {
    const firstInvalid = STEPS.find((candidate) => errors[candidate]);
    if (firstInvalid) {
      setStep(firstInvalid);
      setAttempted((current) => ({ ...current, [firstInvalid]: true }));
      toast.error(errors[firstInvalid] ?? t("storefront.builder.error.generic"));
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/storefront/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || undefined,
            theme,
            productIds: selectedProductIds,
            contact,
            // Keep the public projection private until an explicit Studio publish.
            isActive: false,
            // The private draft is intentionally active so the first Publish is
            // a publish, not a hidden pause that requires a list-page workaround.
            initialDraftIsActive: true,
          }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(translateServerError(data.error, t, t("storefront.builder.error.createFailed")));
        }
        const data = (await response.json()) as { config: { id: string } };
        toast.success(t("storefront.builder.created"));
        router.push(`/storefronts/${encodeURIComponent(data.config.id)}`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("storefront.builder.error.generic"));
      }
    });
  }

  const shownError = attempted[step] ? errors[step] : null;

  return (
    <div data-storefront-studio="bootstrap" className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-2 sm:px-3">
        <Link
          href="/storefronts"
          aria-label={t("storefront.builder.back")}
          title={t("storefront.builder.back")}
          className="flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
        </Link>
        <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        <div className="min-w-0 flex-1 ps-1">
          <h2 className="truncate text-body-sm font-semibold leading-5">{t("storefront.wizard.title")}</h2>
          <p className="truncate text-caption leading-4 text-muted-foreground">
            {t("storefront.wizard.stepOf", { current: index + 1, total: STEPS.length })}
          </p>
        </div>
        <ol className="flex items-center gap-1 max-md:hidden" aria-label={t("storefront.wizard.title")}>
          {STEPS.map((candidate, position) => {
            const done = position < index;
            const current = candidate === step;
            return (
              <li key={candidate} className="flex items-center gap-1">
                {position > 0 ? <span className="h-px w-5 bg-border" aria-hidden="true" /> : null}
                <button
                  type="button"
                  disabled={!reachable(candidate)}
                  aria-current={current ? "step" : undefined}
                  data-wizard-step={candidate}
                  onClick={() => setStep(candidate)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-full px-2.5 text-caption font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    current ? "bg-primary-subtle text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                      done && "border-primary bg-primary text-primary-foreground",
                      current && "border-primary text-primary",
                    )}
                  >
                    {done ? <Check className="size-3" aria-hidden="true" /> : position + 1}
                  </span>
                  {t(`storefront.wizard.step.${candidate}`)}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex-1 max-md:hidden" />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-e bg-background">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <p className="text-caption font-semibold uppercase tracking-wider text-primary">
              {t("storefront.wizard.stepOf", { current: index + 1, total: STEPS.length })}
            </p>
            <h3 className="mt-1.5 text-title-2 font-semibold">{t(`storefront.wizard.${step}Title`)}</h3>
            <p className="mt-1.5 text-body-sm leading-5 text-muted-foreground">{t(`storefront.wizard.${step}Hint`)}</p>

            <div className="mt-6 space-y-5">
              {step === "brand" ? (
                <>
                  <TextField
                    label={t("storefront.builder.shopName")}
                    value={name}
                    maxLength={100}
                    placeholder={t("storefront.builder.shopNamePlaceholder")}
                    onChange={handleNameChange}
                  />
                  <div className="space-y-1.5">
                    <label htmlFor="wizard-slug" className="text-body-sm font-medium">
                      {t("storefront.builder.slug")}
                    </label>
                    <div className="flex h-(--control-height) items-center rounded-control border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
                      <span dir="ltr" className="shrink-0 border-e bg-muted/40 px-3 text-caption leading-[calc(var(--control-height)-2px)] text-muted-foreground">
                        /storefront/
                      </span>
                      <input
                        id="wizard-slug"
                        dir="ltr"
                        value={slug}
                        maxLength={50}
                        spellCheck={false}
                        onChange={(event) => setSlug(slugify(event.target.value))}
                        className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-body-sm outline-none"
                      />
                    </div>
                    <p className="text-caption text-muted-foreground">{t("storefront.wizard.urlHint")}</p>
                  </div>
                  <TextAreaField
                    label={t("storefront.builder.description")}
                    value={description}
                    maxLength={500}
                    onChange={setDescription}
                  />
                </>
              ) : null}

              {step === "look" ? (
                <>
                  <TemplateGallery value={template} onChange={setTemplate} />
                  <div>
                    <p className="mb-2 text-body-sm font-medium">{t("storefront.studio.palettes")}</p>
                    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("storefront.studio.palettes")}>
                      <PaletteSwatch
                        label={t("storefront.wizard.templateColors")}
                        selected={paletteId === null}
                        onSelect={() => setPaletteId(null)}
                      />
                      {STOREFRONT_PALETTES.map((palette) => (
                        <PaletteSwatch
                          key={palette.id}
                          label={t(`storefront.studio.palette.${palette.id}`)}
                          colors={[palette.primaryColor, palette.accentColor, palette.backgroundColor]}
                          selected={paletteId === palette.id}
                          onSelect={() => setPaletteId(palette.id)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              {step === "products" ? (
                <ProductsPanel
                  products={products}
                  selected={selectedProductIds}
                  onChange={(id, selected) =>
                    setSelectedProductIds((current) =>
                      selected ? [...new Set([...current, id])] : current.filter((candidate) => candidate !== id),
                    )
                  }
                  onSetAll={setSelectedProductIds}
                />
              ) : null}

              {step === "delivery" ? (
                <>
                  <section className="space-y-3" aria-labelledby="wizard-delivery-heading">
                    <h4 id="wizard-delivery-heading" className="text-body-sm font-semibold">{t("storefront.wizard.deliveryPrices")}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <FeeField id="wizard-home-fee" label={t("storefront.studio.option.home")} value={homeFee} onChange={setHomeFee} />
                      <FeeField id="wizard-desk-fee" label={t("storefront.studio.option.desk")} value={deskFee} onChange={setDeskFee} />
                    </div>
                    <p className={cn("text-caption leading-5", shippingRules.length ? "text-success" : "text-muted-foreground")}>
                      {shippingRules.length
                        ? t("storefront.wizard.deliveryCovered", { count: WILAYA_CODES.length })
                        : t("storefront.wizard.deliveryLater")}
                    </p>
                  </section>
                  <section className="space-y-3.5 border-t pt-5" aria-labelledby="wizard-contact-heading">
                    <h4 id="wizard-contact-heading" className="text-body-sm font-semibold">{t("storefront.builder.contactInfo")}</h4>
                    <TextField label={t("storefront.builder.phone")} type="tel" dir="ltr" value={phone} maxLength={64} onChange={setPhone} />
                    <TextField label={t("storefront.builder.whatsapp")} type="tel" dir="ltr" value={whatsapp} maxLength={64} onChange={setWhatsapp} />
                    <TextField label={t("storefront.builder.email")} type="email" dir="ltr" value={email} maxLength={254} onChange={setEmail} />
                    <TextField label={t("storefront.builder.address")} value={address} maxLength={240} onChange={setAddress} />
                  </section>
                  <p className="flex gap-2.5 rounded-surface border bg-muted/30 p-3 text-caption leading-5 text-muted-foreground">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {t("storefront.wizard.ready")}
                  </p>
                </>
              ) : null}

              {shownError ? (
                <p role="alert" className="rounded-control border border-destructive/30 bg-destructive-soft px-3 py-2 text-body-sm text-destructive">
                  {shownError}
                </p>
              ) : null}
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-6 py-3.5">
            <button
              type="button"
              disabled={index === 0 || pending}
              onClick={() => setStep(STEPS[index - 1] ?? "brand")}
              className="inline-flex h-9 items-center gap-2 rounded-control px-3 text-body-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:invisible"
            >
              <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
              {t("storefront.wizard.back")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={last ? createAndOpenStudio : next}
              data-wizard-primary="true"
              className="inline-flex h-9 items-center gap-2 rounded-control bg-primary px-4 text-body-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {last ? t("storefront.wizard.create") : t("storefront.wizard.continue")}
              {!last && !pending ? <ArrowRight className="size-4 icon-rtl-flip" aria-hidden="true" /> : null}
            </button>
          </footer>
        </aside>

        <main className="relative min-h-0 min-w-0 max-lg:hidden">
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
            <div
              role="radiogroup"
              aria-label={t("storefront.studio.previewDevice")}
              className="flex items-center gap-2 rounded-full border bg-background/95 p-1 ps-3 shadow-(--elevation-2) backdrop-blur"
            >
              <span className="text-caption font-medium text-muted-foreground">
                {t("storefront.studio.preview")} · {t(TEMPLATE_COPY[template])}
              </span>
              {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([id, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={device === id}
                  aria-label={t(`storefront.studio.device.${id}`)}
                  title={t(`storefront.studio.device.${id}`)}
                  onClick={() => setDevice(id)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    device === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className="absolute inset-0 pt-10">
            <div className="relative h-full">
              <StudioCanvas draft={draft} products={products} device={device} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PaletteSwatch({
  label,
  colors,
  selected,
  onSelect,
}: {
  label: string;
  colors?: readonly string[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={label}
      onClick={onSelect}
      className={cn(
        "rounded-control border p-1.5 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
      )}
    >
      <span className="flex h-6 overflow-hidden rounded-[6px] border border-black/5" aria-hidden="true">
        {colors ? (
          colors.map((color) => <span key={color} className="flex-1" style={{ background: color }} />)
        ) : (
          <span className="flex flex-1 items-center justify-center bg-muted">
            <Sparkles className="size-3.5 text-muted-foreground" />
          </span>
        )}
      </span>
      <span className="mt-1 block truncate text-[11px] font-medium">{label}</span>
    </button>
  );
}

function FeeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block truncate text-body-sm font-medium">{label}</label>
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          dir="ltr"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="pe-12 tabular-nums"
        />
        <span dir="ltr" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-caption text-muted-foreground">
          {CURRENCY}
        </span>
      </div>
    </div>
  );
}
