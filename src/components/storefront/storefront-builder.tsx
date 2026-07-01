"use client";

import { useState, useTransition, useMemo } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, ExternalLink, Search, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { StorefrontConfig, StorefrontTheme, StorefrontContact } from "@/lib/storefront/service";

export interface ProductOption {
  id: string;
  name: string;
  price: number;
  sku: string | null;
  stock: number;
  images: string | null;
}

interface Props {
  config: StorefrontConfig;
  products: ProductOption[];
  mode: "create" | "edit";
}

const TEMPLATES: { value: StorefrontTheme["template"]; labelKey: string; descKey: string }[] = [
  { value: "minimal", labelKey: "storefront.builder.template.minimal", descKey: "storefront.builder.template.minimalDesc" },
  { value: "modern", labelKey: "storefront.builder.template.modern", descKey: "storefront.builder.template.modernDesc" },
  { value: "classic", labelKey: "storefront.builder.template.classic", descKey: "storefront.builder.template.classicDesc" },
];

const PRESET_COLORS = ["#0f766e", "#b45309", "#9f1239", "#1e3a8a", "#166534", "#7c2d12"];

export function StorefrontBuilder({ config: initialConfig, products, mode }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initialConfig.name);
  const [slug, setSlug] = useState(initialConfig.slug);
  const [description, setDescription] = useState(initialConfig.description ?? "");
  const [theme, setTheme] = useState<StorefrontTheme>(initialConfig.theme);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(initialConfig.productIds);
  const [contact, setContact] = useState<StorefrontContact>(initialConfig.contact ?? {});
  const [isActive, setIsActive] = useState(initialConfig.isActive);
  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q) ?? false),
    );
  }, [products, search]);

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  }

  function handleNameChange(value: string) {
    setName(value);
    // Auto-generate slug in create mode (only if user hasn't manually edited it)
    if (mode === "create") {
      setSlug(slugify(value));
    }
  }

  function buildPayload() {
    return {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      theme,
      productIds: selectedProductIds,
      contact: Object.values(contact).some((v) => v && v.trim()) ? contact : null,
      isActive,
    };
  }

  function validate(): string | null {
    if (!name.trim()) return t("storefront.builder.error.nameRequired");
    if (!slug.trim()) return t("storefront.builder.error.slugRequired");
    if (!/^[a-z0-9-]+$/.test(slug)) return t("storefront.builder.error.slugFormat");
    if (selectedProductIds.length === 0) return t("storefront.builder.error.productRequired");
    return null;
  }

  async function handleSave() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    const payload = buildPayload();
    startTransition(async () => {
      try {
        if (mode === "create") {
          const res = await fetch("/api/storefront/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || t("storefront.builder.error.createFailed"));
          }
          const { config: created } = await res.json();
          toast.success(t("storefront.builder.created"));
          router.push(`/storefronts/${created.id}`);
          router.refresh();
        } else {
          const res = await fetch(`/api/storefront/config/${initialConfig.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || t("storefront.builder.error.updateFailed"));
          }
          toast.success(t("storefront.builder.saved"));
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("storefront.builder.error.generic"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/storefronts">
            <ArrowLeft className="h-4 w-4 me-2 rtl:rotate-180" />
            {t("storefront.builder.back")}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {mode === "edit" && initialConfig.isActive && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/storefront/${initialConfig.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5 me-2" />
                {t("storefront.builder.viewStore")}
              </a>
            </Button>
          )}
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
            {mode === "create" ? t("storefront.builder.create") : t("storefront.builder.save")}
          </Button>
        </div>
      </div>

      {/* General settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("storefront.builder.generalInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("storefront.builder.shopName")} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={t("storefront.builder.shopNamePlaceholder")}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">{t("storefront.builder.slug")} *</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/storefront/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder={t("storefront.builder.slugPlaceholder")}
                  className="font-mono"
                  maxLength={50}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("storefront.builder.slugHint")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("storefront.builder.description")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("storefront.builder.descriptionPlaceholder")}
              maxLength={500}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="active" className="cursor-pointer">{t("storefront.builder.active")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("storefront.builder.activeHint")}
              </p>
            </div>
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </CardContent>
      </Card>

      {/* Product picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>{t("storefront.builder.productsDisplayed")} *</span>
            <Badge variant="secondary">{t("storefront.builder.selectedCount", { count: selectedProductIds.length })}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("storefront.builder.searchProduct")}
              className="ps-9"
            />
          </div>
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {products.length === 0
                ? t("storefront.builder.noActiveProducts")
                : t("storefront.builder.noMatchingProducts")}
            </p>
          ) : (
            <div className="border rounded-lg max-h-96 overflow-y-auto divide-y">
              {filteredProducts.map((product) => {
                const selected = selectedProductIds.includes(product.id);
                return (
                  <label
                    key={product.id}
                    className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                      selected ? "bg-accent/30" : ""
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        selected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input"
                      }`}
                    >
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selected}
                      onChange={() => toggleProduct(product.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.sku && <span className="font-mono">{product.sku} · </span>}
                        {t("storefront.builder.stock")}: {product.stock}
                      </div>
                    </div>
                    <div className="text-sm font-semibold whitespace-nowrap">
                      {formatDZD(product.price)}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("storefront.builder.appearance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("storefront.builder.template")}</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.value}
                  type="button"
                  onClick={() => setTheme({ ...theme, template: tpl.value })}
                  className={`text-start p-3 rounded-lg border-2 transition-colors ${
                    theme.template === tpl.value
                      ? "border-primary bg-accent/30"
                      : "border-border hover:border-foreground/20"
                  }`}
                >
                  <div className="text-sm font-medium">{t(tpl.labelKey)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t(tpl.descKey)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("storefront.builder.primaryColor")}</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setTheme({ ...theme, primaryColor: color })}
                  className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    theme.primaryColor === color
                      ? "border-foreground ring-2 ring-foreground/20"
                      : "border-background"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={theme.primaryColor}
                onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                className="h-8 w-8 rounded cursor-pointer border border-input"
              />
              <span className="text-sm text-muted-foreground font-mono ms-1">
                {theme.primaryColor}
              </span>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="cursor-pointer">{t("storefront.builder.showPrices")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("storefront.builder.showPricesHint")}
              </p>
            </div>
            <Switch
              checked={theme.showPrices}
              onCheckedChange={(v) => setTheme({ ...theme, showPrices: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="cursor-pointer">{t("storefront.builder.showStock")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("storefront.builder.showStockHint")}
              </p>
            </div>
            <Switch
              checked={theme.showStock}
              onCheckedChange={(v) => setTheme({ ...theme, showStock: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("storefront.builder.contactInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("storefront.builder.contactInfoDesc")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-phone">{t("storefront.builder.phone")}</Label>
              <Input
                id="contact-phone"
                value={contact.phone ?? ""}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                placeholder="0555 12 34 56"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-whatsapp">{t("storefront.builder.whatsapp")}</Label>
              <Input
                id="contact-whatsapp"
                value={contact.whatsapp ?? ""}
                onChange={(e) => setContact({ ...contact, whatsapp: e.target.value })}
                placeholder="0555 12 34 56"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">{t("storefront.builder.email")}</Label>
              <Input
                id="contact-email"
                type="email"
                value={contact.email ?? ""}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
                placeholder="contact@boutique.dz"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-address">{t("storefront.builder.address")}</Label>
              <Input
                id="contact-address"
                value={contact.address ?? ""}
                onChange={(e) => setContact({ ...contact, address: e.target.value })}
                placeholder="Alger, Algérie"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
