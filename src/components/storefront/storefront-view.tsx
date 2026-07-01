"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Plus,
  Minus,
  Loader2,
  CheckCircle2,
  Check,
  AlertCircle,
  Trash2,
} from "lucide-react";
import type { StorefrontConfig } from "@/lib/storefront/service";

interface StorefrontProduct {
  id: string;
  name: string;
  price: number;
  sku: string | null;
  images: string | null;
  stock: number;
}

interface CartItem {
  product: StorefrontProduct;
  quantity: number;
}

interface StorefrontViewProps {
  config: StorefrontConfig;
  products: StorefrontProduct[];
}

export function StorefrontView({ config, products }: StorefrontViewProps) {
  const { t } = useI18n();
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; orderNumber?: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    wilaya: "",
    commune: "",
    address: "",
    notes: "",
  });

  function addToCart(product: StorefrontProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/storefront/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: config.slug,
          customer: {
            name: form.name,
            phone: form.phone,
            wilaya: form.wilaya,
            commune: form.commune,
            address: form.address,
          },
          items: cart.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
          })),
          notes: form.notes || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message: string;
        orderNumber?: string;
        error?: string;
      };
      if (data.ok) {
        setResult(data);
        setCart([]);
        setForm({ name: "", phone: "", wilaya: "", commune: "", address: "", notes: "" });
      } else {
        setResult({ ok: false, message: data.error ?? t("storefront.view.error.orderFailed") });
      }
    } catch {
      setResult({ ok: false, message: t("storefront.view.error.connectionFailed") });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" >
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto" />
            <h1 className="text-2xl font-bold">{t("storefront.view.orderConfirmed")}</h1>
            <p className="text-muted-foreground">{result.message}</p>
            {result.orderNumber && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t("storefront.view.orderNumber")}</p>
                <p className="font-mono text-lg font-bold">{result.orderNumber}</p>
              </div>
            )}
            <Button onClick={() => setResult(null)} variant="outline">
              {t("storefront.view.anotherOrder")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" >
      {/* Header */}
      <header
        className="border-b"
        style={{ backgroundColor: config.theme.primaryColor, borderColor: config.theme.primaryColor }}
      >
        <div className="max-w-5xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
          {config.description && (
            <p className="text-white/80 text-sm mt-1">{config.description}</p>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6">
        {/* Product grid */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold">{t("storefront.view.ourProducts")}</h2>
          {products.length === 0 ? (
            <p className="text-muted-foreground">{t("storefront.view.noProducts")}</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {products.map((product) => (
                <Card key={product.id}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        {product.images && (
                      <div className="aspect-square w-full rounded-lg bg-muted overflow-hidden mb-3">
                        <img
                          src={(() => { try { return JSON.parse(product.images)[0]; } catch { return product.images.split(",")[0]; } })()}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    )}
                    <h3 className="font-medium">{product.name}</h3>
                        {product.sku && (
                          <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                        )}
                      </div>
                      {config.theme.showStock && (
                        <Badge variant={product.stock > 0 ? "default" : "destructive"}>
                          {product.stock > 0
                            ? t("storefront.view.inStock", { count: product.stock })
                            : t("storefront.view.outOfStock")}
                        </Badge>
                      )}
                    </div>
                    {config.theme.showPrices && (
                      <p className="text-lg font-bold" style={{ color: config.theme.primaryColor }}>
                        {product.price.toLocaleString("fr-DZ")} DA
                      </p>
                    )}
                    <Button
                      onClick={() => {
                      addToCart(product);
                      setAddedProductId(product.id);
                      setTimeout(() => setAddedProductId(null), 1500);
                    }}
                      disabled={config.theme.showStock && product.stock === 0}
                      size="sm"
                      className="w-full"
                      style={{ backgroundColor: config.theme.primaryColor }}
                    >
                      {addedProductId === product.id ? (
                        <Check className="h-4 w-4 me-1" />
                      ) : (
                        <Plus className="h-4 w-4 me-1" />
                      )}
                      {addedProductId === product.id ? t("storefront.view.added") : t("storefront.view.addToCart")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Cart + checkout */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-4 w-4" />
                {t("storefront.view.cart", { count: cart.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("storefront.view.emptyCart")}
                </p>
              ) : (
                <>
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.product.price.toLocaleString("fr-DZ")} DA
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => updateQuantity(item.product.id, -1)} aria-label={t("storefront.view.decreaseQty")}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-xs">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => updateQuantity(item.product.id, 1)} aria-label={t("storefront.view.increaseQty")}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.product.id)} aria-label={t("storefront.view.removeItem")}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-bold">
                    <span>{t("storefront.view.total")}</span>
                    <span>{cartTotal.toLocaleString("fr-DZ")} DA</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* COD checkout form */}
          {cart.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("storefront.view.checkout")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="name">{t("storefront.view.fullName")} *</Label>
                    <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="phone">{t("storefront.view.phone")} *</Label>
                    <Input id="phone" required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0XXXXXXXXX" />
                  </div>
                  <WilayaCommuneSelect
                    wilaya={form.wilaya}
                    commune={form.commune}
                    onWilayaChange={(v) => setForm({ ...form, wilaya: v })}
                    onCommuneChange={(v) => setForm({ ...form, commune: v })}
                    wilayaLabel={`${t("storefront.view.wilaya")} *`}
                    communeLabel={`${t("storefront.view.commune")} *`}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="address">{t("storefront.view.address")} *</Label>
                    <Input id="address" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notes">{t("storefront.view.notes")}</Label>
                    <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                  {result && !result.ok && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{result.message}</span>
                    </div>
                  )}
                  <Button type="submit" disabled={submitting} className="w-full" style={{ backgroundColor: config.theme.primaryColor }}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                        {t("storefront.view.sending")}
                      </>
                    ) : (
                      t("storefront.view.confirmOrder")
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Contact info */}
          {config.contact && (
            <Card>
              <CardContent className="pt-4 text-sm space-y-1">
                <p className="font-medium">{t("storefront.view.contact")}</p>
                {config.contact.phone && <p className="text-muted-foreground">📞 {config.contact.phone}</p>}
                {config.contact.whatsapp && <p className="text-muted-foreground">💬 {config.contact.whatsapp}</p>}
                {config.contact.email && <p className="text-muted-foreground">✉️ {config.contact.email}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
