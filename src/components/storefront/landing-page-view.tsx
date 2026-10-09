"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Truck } from "lucide-react";

import { StorefrontLanguageSwitcher } from "@/components/storefront/storefront-language-switcher";
import {
  StorefrontLocaleProvider,
  useStorefrontI18n,
} from "@/components/storefront/storefront-locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";
import type { PublicLandingPage } from "@/lib/storefront/landing-page-service";
import type { StorefrontConfig } from "@/lib/storefront/service";
import {
  DZ_PHONE_PLACEHOLDER,
  isValidDZMobilePhone,
  normalizeDZPhone,
} from "@/lib/validation/phone";
import { formatDZD } from "@/lib/utils";
import wilayasData from "../../../data/wilayas.json";

/**
 * FD-061 EX-4: the public per-product landing page buyer surface — the
 * immutable image stack (single imageGap spacing setting) above a compact
 * COD order form. The form posts to the SAME server-authoritative checkout
 * as the storefront home (/api/storefront/submit) and additionally carries
 * `landingPageSlug`, the research contract's attribution: best-effort,
 * revenue first — an unknown slug never blocks the order.
 */

interface LandingPageViewProps {
  config: StorefrontConfig;
  page: PublicLandingPage;
  initialLocale: string;
}

interface SubmitResult {
  ok: boolean;
  orderNumber: string | null;
  message: string | null;
}

function parseLegacyImages(images: string | null): string[] {
  if (!images) return [];
  try {
    const parsed = JSON.parse(images) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (url): url is string =>
            typeof url === "string" && url.startsWith("/uploads/"),
        )
      : [];
  } catch {
    return [];
  }
}

export function LandingPageView({ config, page, initialLocale }: LandingPageViewProps) {
  return (
    <StorefrontLocaleProvider initialLocale={initialLocale as never}>
      <div className="flex justify-end px-4 pt-3">
        <StorefrontLanguageSwitcher />
      </div>
      <LandingPageBody config={config} page={page} />
    </StorefrontLocaleProvider>
  );
}

function LandingPageBody({
  config,
  page,
}: {
  config: StorefrontConfig;
  page: PublicLandingPage;
}) {
  const { t, locale } = useStorefrontI18n();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    wilaya: "",
    commune: "",
    address: "",
    notes: "",
    website: "",
    deliveryMode: "home" as "home" | "desk",
  });

  const variant = useMemo(
    () => page.product.variants.find((candidate) => candidate.id === variantId) ?? null,
    [page.product.variants, variantId],
  );
  const unitPrice = variant?.price ?? page.product.price;
  const stock = variant?.stock ?? page.product.stock;
  const available = stock > 0;
  const stackImages = page.images.length > 0
    ? page.images.map((image) => ({ url: image.url, alt: image.altText, width: image.width, height: image.height }))
    : parseLegacyImages(page.product.images).map((url) => ({ url, alt: null, width: null, height: null }));

  const submissionStorageKey = `sf-storefront-submission:${config.slug}`;
  const wilayaCode = useMemo(
    () =>
      (wilayasData as Array<{ code: number; name: string }>).find(
        (wilaya) => wilaya.name === form.wilaya,
      )?.code.toString().padStart(2, "0"),
    [form.wilaya],
  );
  const shippingRule = config.theme.builder.shippingRules.find(
    (rule) => rule.wilayaCode === wilayaCode && rule.deliveryMode === form.deliveryMode,
  );
  const shippingDzd = shippingRule?.feeDzd ?? 0;
  const total = unitPrice * quantity + shippingDzd;

  function submissionId(): string {
    try {
      const stored = window.localStorage.getItem(submissionStorageKey);
      if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
      const created = crypto.randomUUID();
      window.localStorage.setItem(submissionStorageKey, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  }

  function updateForm(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorCode(null);

    if (!form.name.trim()) {
      setErrorCode("nameRequired");
      return;
    }
    const phone = normalizeDZPhone(form.phone);
    if (!isValidDZMobilePhone(phone)) {
      setErrorCode("phoneInvalid");
      return;
    }
    if (!form.wilaya || !form.commune || !form.address.trim()) {
      setErrorCode("addressRequired");
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/storefront/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: config.slug,
          submissionId: submissionId(),
          // FD-061 EX-4: landing-page attribution — best-effort, revenue
          // first. An unknown/draft slug leaves the order unattributed and
          // the order still succeeds.
          landingPageSlug: page.slug,
          customer: {
            name: form.name.trim(),
            phone,
            wilaya: form.wilaya,
            commune: form.commune,
            address: form.address.trim(),
          },
          items: [
            {
              productId: page.product.id,
              productVariantId: variant?.id ?? null,
              quantity,
            },
          ],
          notes: form.notes.trim() || undefined,
          deliveryMode: form.deliveryMode,
          website: form.website || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        orderNumber?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setErrorCode(
          payload.error === "delivery_unavailable" ? "deliveryUnavailable" : "orderFailed",
        );
        return;
      }
      setResult({
        ok: true,
        orderNumber: payload.orderNumber ?? null,
        message: payload.message ?? null,
      });
    } catch {
      setErrorCode("connectionFailed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <CheckCircle2 className="size-14 text-emerald-600" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">{t("storefront.view.orderConfirmed")}</h1>
        {result.orderNumber ? (
          <p className="text-lg">
            <span className="text-muted-foreground">{t("storefront.view.orderNumber")}: </span>
            <span className="font-mono font-semibold">{result.orderNumber}</span>
          </p>
        ) : null}
        <p className="text-muted-foreground">
          {result.message ?? t("storefront.view.orderSuccessMessage")}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setResult(null);
            setQuantity(1);
          }}
        >
          {t("storefront.view.anotherOrder")}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      {/* FD-061 EX-4: the image stack — full-width, single spacing setting. */}
      {stackImages.length > 0 ? (
        <section aria-label={page.name} className="pt-4">
          {stackImages.map((image, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- buyer surface serves local immutable uploads
            <img
              key={`${image.url}-${index}`}
              src={image.url}
              alt={image.alt ?? page.product.name}
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              style={{ marginBottom: index < stackImages.length - 1 ? page.imageGap : 0 }}
              className="w-full rounded-lg object-cover"
              loading={index === 0 ? "eager" : "lazy"}
            />
          ))}
        </section>
      ) : null}

      <section className="mt-6">
        <h1 className="text-2xl font-semibold">{page.product.name}</h1>
        <p className="mt-1 text-xl font-semibold text-primary">{formatDZD(unitPrice, locale)}</p>
        {available ? null : (
          <p className="mt-1 text-sm font-medium text-destructive">
            {t("storefront.view.landing.soldOut")}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("storefront.view.landing.codBadge")}
        </p>
      </section>

      <form
        noValidate
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-lg border bg-card p-4"
        aria-label={t("storefront.view.landing.orderFormLabel")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lp-name">{t("storefront.view.fullName")}</Label>
            <Input
              id="lp-name"
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-phone">{t("storefront.view.phone")}</Label>
            <Input
              id="lp-phone"
              type="tel"
              inputMode="tel"
              placeholder={DZ_PHONE_PLACEHOLDER}
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              autoComplete="tel"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <WilayaCommuneSelect
            wilaya={form.wilaya}
            commune={form.commune}
            onWilayaChange={(value) => updateForm("wilaya", value)}
            onCommuneChange={(value) => updateForm("commune", value)}
            wilayaLabel={`${t("storefront.view.wilaya")} *`}
            communeLabel={`${t("storefront.view.commune")} *`}
            locale={locale}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-address">{t("storefront.view.address")}</Label>
          <Input
            id="lp-address"
            value={form.address}
            onChange={(event) => updateForm("address", event.target.value)}
            autoComplete="street-address"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="lp-variant">{t("storefront.view.landing.variant")}</Label>
            <select
              id="lp-variant"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              disabled={page.product.variants.length === 0}
            >
              <option value="">{t("storefront.view.landing.variantStandard")}</option>
              {page.product.variants.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-quantity">{t("storefront.view.landing.quantity")}</Label>
            <Input
              id="lp-quantity"
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={(event) =>
                setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-delivery">{t("storefront.view.deliveryMode")}</Label>
            <select
              id="lp-delivery"
              value={form.deliveryMode}
              onChange={(event) =>
                updateForm("deliveryMode", event.target.value)
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              <option value="home">{t("storefront.view.deliveryHome")}</option>
              <option value="desk">{t("storefront.view.deliveryDesk")}</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-notes">{t("storefront.view.notes")}</Label>
          <Input
            id="lp-notes"
            value={form.notes}
            onChange={(event) => updateForm("notes", event.target.value)}
          />
        </div>

        {/* Honeypot — visually hidden, bots only. */}
        <div className="sr-only" aria-hidden="true">
          <Label htmlFor="lp-website">{t("storefront.view.honeypot")}</Label>
          <Input
            id="lp-website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => updateForm("website", event.target.value)}
          />
        </div>

        <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Truck className="size-4" aria-hidden="true" />
              {t("storefront.view.shipping")}
            </span>
            <span>{formatDZD(shippingDzd, locale)}</span>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <span>{t("storefront.view.total")}</span>
            <span>{formatDZD(total, locale)}</span>
          </div>
        </div>

        {errorCode ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {t(
              errorCode === "deliveryUnavailable"
                ? "storefront.view.error.deliveryUnavailable"
                : errorCode === "phoneInvalid"
                  ? "storefront.view.error.phoneInvalid"
                  : errorCode === "addressRequired"
                    ? "storefront.view.error.addressRequired"
                    : errorCode === "connectionFailed"
                      ? "storefront.view.error.connectionFailed"
                      : "storefront.view.error.orderFailed",
            )}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full text-base" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("storefront.view.sending")}
            </>
          ) : (
            t("storefront.view.confirmOrder")
          )}
        </Button>
      </form>
    </main>
  );
}
