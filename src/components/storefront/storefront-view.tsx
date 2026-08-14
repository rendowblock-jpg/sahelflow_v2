"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { StorefrontRenderer } from "@/components/storefront/storefront-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontConfig } from "@/lib/storefront/service";
import { createStorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { formatDZD } from "@/lib/utils";
import wilayasData from "../../../data/wilayas.json";

interface StorefrontVariant {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  isActive: boolean;
}

interface StorefrontProduct {
  id: string;
  name: string;
  price: number;
  sku: string | null;
  images: string | null;
  stock: number;
  productVariants: StorefrontVariant[];
}

interface CartItem {
  key: string;
  product: StorefrontProduct;
  variant: StorefrontVariant | null;
  quantity: number;
}

interface StorefrontViewProps {
  config: StorefrontConfig;
  products: StorefrontProduct[];
}

interface SubmitResult {
  ok: boolean;
  message: string;
  orderNumber?: string;
}

function cartKey(productId: string, variantId: string | null): string {
  return `${productId}:${variantId ?? "base"}`;
}

function itemPrice(item: Pick<CartItem, "product" | "variant">): number {
  return item.variant?.price ?? item.product.price;
}

export function StorefrontView({ config, products }: StorefrontViewProps) {
  const { t, locale } = useI18n();
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
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

  const draft = useMemo(() => createStorefrontStudioDraft(config), [config]);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const renderedProducts = useMemo(
    () => products.map((product) => {
      const variant = product.productVariants.find(
        (candidate) => candidate.isActive && candidate.id === selectedVariants[product.id],
      );
      return {
        ...product,
        price: variant?.price ?? product.price,
        stock: variant?.stock ?? product.stock,
      };
    }),
    [products, selectedVariants],
  );

  const submissionStorageKey = `sf-storefront-submission:${config.slug}`;
  const cartStorageKey = `sf-storefront-cart:${config.slug}`;
  const wilayaCode = useMemo(() => (wilayasData as Array<{ code: number; name: string }>).find(
    (wilaya) => wilaya.name === form.wilaya,
  )?.code.toString().padStart(2, "0"), [form.wilaya]);
  const shippingRule = config.theme.builder.shippingRules.find((rule) =>
    rule.wilayaCode === wilayaCode && rule.deliveryMode === form.deliveryMode);
  const shippingDzd = shippingRule?.feeDzd ?? 0;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cartStorageKey);
      const saved = raw ? JSON.parse(raw) as unknown : [];
      if (Array.isArray(saved)) {
        const restored: CartItem[] = [];
        for (const entry of saved.slice(0, 50)) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
          const row = entry as Record<string, unknown>;
          const product = productById.get(String(row.productId ?? ""));
          if (!product) continue;
          const variantId = row.variantId === null ? null : String(row.variantId ?? "");
          const variant = variantId
            ? product.productVariants.find((candidate) => candidate.isActive && candidate.id === variantId) ?? null
            : null;
          if (variantId && !variant) continue;
          const stock = variant?.stock ?? product.stock;
          const quantity = Math.min(Number(row.quantity), stock, 100);
          if (!Number.isSafeInteger(quantity) || quantity < 1) continue;
          restored.push({ key: cartKey(product.id, variant?.id ?? null), product, variant, quantity });
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the cart after hydration
        setCart(restored);
      }
    } catch {
      // Ignore malformed or unavailable local storage; checkout remains usable.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mark hydration complete after restore
    setCartReady(true);
  }, [cartStorageKey, productById]);

  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cart.map((item) => ({
        productId: item.product.id,
        variantId: item.variant?.id ?? null,
        quantity: item.quantity,
      }))));
    } catch {
      // Hardened browsers may deny storage; in-memory checkout remains usable.
    }
  }, [cart, cartReady, cartStorageKey]);

  function invalidateSubmission(): void {
    try {
      window.localStorage.removeItem(submissionStorageKey);
    } catch {
      // Storage can be unavailable in hardened browsers; submission still works.
    }
  }

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

  function changeForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void {
    invalidateSubmission();
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addToCart(product: StorefrontProduct): void {
    const activeVariants = product.productVariants.filter((variant) => variant.isActive);
    const selectedVariantId = selectedVariants[product.id] ?? "";
    const variant = activeVariants.find((entry) => entry.id === selectedVariantId) ?? null;
    if (activeVariants.length > 0 && !variant) return;

    invalidateSubmission();
    const key = cartKey(product.id, variant?.id ?? null);
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      return existing
        ? current.map((item) => item.key === key
          ? { ...item, quantity: Math.min(item.quantity + 1, variant?.stock ?? product.stock, 100) }
          : item)
        : [...current, { key, product, variant, quantity: 1 }];
    });
    setAddedKey(key);
    window.setTimeout(() => setAddedKey(null), 1500);
  }

  function updateQuantity(key: string, delta: number): void {
    invalidateSubmission();
    setCart((current) => current
      .map((item) => item.key === key
        ? { ...item, quantity: Math.min(
            Math.max(0, item.quantity + delta),
            item.variant?.stock ?? item.product.stock,
            100,
          ) }
        : item)
      .filter((item) => item.quantity > 0));
  }

  function removeFromCart(key: string): void {
    invalidateSubmission();
    setCart((current) => current.filter((item) => item.key !== key));
  }

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + itemPrice(item) * item.quantity,
    0,
  );
  const cartTotal = cartSubtotal + shippingDzd;

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (cart.length === 0) return;

    const phone = form.phone.replace(/\s/g, "");
    if (!form.name.trim()) {
      setResult({ ok: false, message: t("storefront.view.error.nameRequired") });
      return;
    }
    if (!/^0[5-7]\d{8}$/.test(phone)) {
      setResult({ ok: false, message: t("storefront.view.error.phoneInvalid") });
      return;
    }
    if (!form.wilaya || !form.commune || !form.address.trim()) {
      setResult({ ok: false, message: t("storefront.view.error.addressRequired") });
      return;
    }
    if (config.theme.builder.shippingRules.length > 0 && !shippingRule) {
      setResult({ ok: false, message: t("storefront.view.error.deliveryUnavailable") });
      return;
    }

    const stableSubmissionId = submissionId();
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/storefront/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: config.slug,
          submissionId: stableSubmissionId,
          customer: {
            name: form.name.trim(),
            phone,
            wilaya: form.wilaya,
            commune: form.commune,
            address: form.address.trim(),
          },
          items: cart.map((item) => ({
            productId: item.product.id,
            productVariantId: item.variant?.id ?? null,
            quantity: item.quantity,
          })),
          notes: form.notes.trim() || undefined,
          deliveryMode: form.deliveryMode,
          website: form.website,
          "cf-turnstile-response": (
            window as unknown as { __TURNSTILE_TOKEN__?: string }
          ).__TURNSTILE_TOKEN__,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        orderNumber?: string;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setResult({
          ok: false,
          message: data.error === "delivery_unavailable"
            ? t("storefront.view.error.deliveryUnavailable")
            : data.error ?? t("storefront.view.error.orderFailed"),
        });
        return;
      }

      invalidateSubmission();
      setResult({
        ok: true,
        message: data.message ?? t("storefront.view.orderSuccessMessage"),
        orderNumber: data.orderNumber,
      });
      setCart([]);
      setForm({
        name: "",
        phone: "",
        wilaya: "",
        commune: "",
        address: "",
        notes: "",
        website: "",
        deliveryMode: "home",
      });
    } catch {
      // Keep the stable ID so response-loss retries replay the committed result.
      setResult({
        ok: false,
        message: t("storefront.view.error.connectionFailed"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
            <h1 className="text-2xl font-bold">{t("storefront.view.orderConfirmed")}</h1>
            <p className="text-muted-foreground">{result.message}</p>
            {result.orderNumber ? (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t("storefront.view.orderNumber")}</p>
                <p className="font-mono text-lg font-bold">{result.orderNumber}</p>
              </div>
            ) : null}
            <Button onClick={() => setResult(null)} variant="outline">
              {t("storefront.view.anotherOrder")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const checkout = (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4" />
            {t("storefront.view.cart", { count: cart.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cart.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("storefront.view.emptyCart")}
            </p>
          ) : (
            <>
              {cart.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.product.name}</p>
                    {item.variant ? <p className="truncate text-xs text-muted-foreground">{item.variant.name}</p> : null}
                    <p className="text-xs text-muted-foreground">{formatDZD(itemPrice(item), locale)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => updateQuantity(item.key, -1)} aria-label={t("storefront.view.decreaseQty")}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-xs">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => updateQuantity(item.key, 1)} aria-label={t("storefront.view.increaseQty")}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeFromCart(item.key)} aria-label={t("storefront.view.removeItem")}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {shippingDzd > 0 ? <div className="flex justify-between border-t pt-2 text-sm"><span>{t("storefront.view.shipping")}</span><span>{formatDZD(shippingDzd, locale)}</span></div> : null}
              <div className="flex justify-between font-bold"><span>{t("storefront.view.total")}</span><span>{formatDZD(cartTotal, locale)}</span></div>
            </>
          )}
        </CardContent>
      </Card>

      {cart.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("storefront.view.checkout")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
                <Label htmlFor="website">{t("storefront.view.honeypot")}</Label>
                <Input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => changeForm("website", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">{t("storefront.view.fullName")} *</Label>
                <Input id="name" required value={form.name} onChange={(event) => changeForm("name", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">{t("storefront.view.phone")} *</Label>
                <Input id="phone" required type="tel" value={form.phone} onChange={(event) => changeForm("phone", event.target.value)} placeholder="0XXXXXXXXX" />
              </div>
              <WilayaCommuneSelect
                wilaya={form.wilaya}
                commune={form.commune}
                onWilayaChange={(value) => changeForm("wilaya", value)}
                onCommuneChange={(value) => changeForm("commune", value)}
                wilayaLabel={`${t("storefront.view.wilaya")} *`}
                communeLabel={`${t("storefront.view.commune")} *`}
              />
              <div className="space-y-1">
                <Label htmlFor="delivery-mode">{t("storefront.view.deliveryMode")}</Label>
                <select id="delivery-mode" value={form.deliveryMode} onChange={(event) => changeForm("deliveryMode", event.target.value as "home" | "desk")} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="home">{t("storefront.view.deliveryHome")}</option>
                  <option value="desk">{t("storefront.view.deliveryDesk")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="address">{t("storefront.view.address")} *</Label>
                <Input id="address" required value={form.address} onChange={(event) => changeForm("address", event.target.value)} />
              </div>
              {config.theme.checkout.showOrderNotes ? (
                <div className="space-y-1">
                  <Label htmlFor="notes">{t("storefront.view.notes")}</Label>
                  <Input id="notes" value={form.notes} onChange={(event) => changeForm("notes", event.target.value)} />
                </div>
              ) : null}
              {result && !result.ok ? (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{result.message}</span>
                </div>
              ) : null}
              <Button type="submit" disabled={submitting} className="w-full" style={{ backgroundColor: config.theme.primaryColor }}>
                {submitting ? (
                  <><Loader2 className="me-1.5 h-4 w-4 animate-spin" />{t("storefront.view.sending")}</>
                ) : t("storefront.view.confirmOrder")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  const support = config.contact ? (
    <Card>
      <CardContent className="grid gap-2 pt-4 text-sm sm:grid-cols-2">
        <p className="font-medium sm:col-span-2">{t("storefront.view.contact")}</p>
        {config.contact.phone ? <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{config.contact.phone}</p> : null}
        {config.contact.whatsapp ? <p className="flex items-center gap-2 text-muted-foreground"><MessageCircle className="h-4 w-4" />{config.contact.whatsapp}</p> : null}
        {config.contact.email ? <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />{config.contact.email}</p> : null}
        {config.contact.address ? <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{config.contact.address}</p> : null}
      </CardContent>
    </Card>
  ) : null;

  return (
    <StorefrontRenderer
      draft={draft}
      products={renderedProducts}
      emptyCatalog={<p className="text-muted-foreground">{t("storefront.view.noProducts")}</p>}
      renderProductFooter={(renderedProduct) => {
        const product = productById.get(renderedProduct.id);
        if (!product) return null;
        const variants = product.productVariants.filter((variant) => variant.isActive);
        const selectedVariant = variants.find((variant) => variant.id === selectedVariants[product.id]);
        const key = cartKey(product.id, selectedVariant?.id ?? null);
        return (
          <div className="space-y-2">
            {variants.length > 0 ? (
              <div className="space-y-1">
                <Label htmlFor={`storefront-variant-${product.id}`}>{t("products.variant")}</Label>
                <select
                  id={`storefront-variant-${product.id}`}
                  value={selectedVariants[product.id] ?? ""}
                  onChange={(event) => {
                    invalidateSubmission();
                    setSelectedVariants((current) => ({ ...current, [product.id]: event.target.value }));
                  }}
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} · {formatDZD(variant.price ?? product.price, locale)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <Button
              onClick={() => addToCart(product)}
              disabled={(variants.length > 0 && !selectedVariant) || renderedProduct.stock <= 0}
              size="sm"
              className="w-full"
              style={{ backgroundColor: config.theme.primaryColor }}
            >
              {addedKey === key ? <Check className="me-1 h-4 w-4" /> : <Plus className="me-1 h-4 w-4" />}
              {addedKey === key ? t("storefront.view.added") : t("storefront.view.addToCart")}
            </Button>
          </div>
        );
      }}
      renderCheckout={checkout}
      renderSupport={support}
    />
  );
}
