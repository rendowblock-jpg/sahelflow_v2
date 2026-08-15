"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Save, Search, Store } from "lucide-react";

import { StorefrontRenderer } from "@/components/storefront/storefront-renderer";
import type { StorefrontStudioProduct } from "@/components/storefront/studio/studio-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import {
  STOREFRONT_TEMPLATE_IDS,
  type StorefrontTemplateId,
} from "@/lib/storefront/presentation-types";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { toast } from "@/lib/toast";

interface Props {
  products: StorefrontStudioProduct[];
}

const TEMPLATE_COPY: Record<
  StorefrontTemplateId,
  { label: string; description: string }
> = {
  sahara: {
    label: "storefront.studio.template.sahara",
    description: "storefront.studio.template.saharaRole",
  },
  atlas: {
    label: "storefront.studio.template.atlas",
    description: "storefront.studio.template.atlasRole",
  },
  oasis: {
    label: "storefront.studio.template.oasis",
    description: "storefront.studio.template.oasisRole",
  },
};

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

export function StorefrontStudioBootstrap({ products }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<StorefrontTemplateId>("atlas");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const theme = useMemo(() => createDefaultStorefrontTheme(template), [template]);
  const draft = useMemo<StorefrontStudioDraft>(
    () => ({
      name: name.trim() || t("storefront.builder.shopNamePlaceholder"),
      slug: slug.trim() || "preview",
      description,
      theme,
      selectedProductIds,
      isActive: false,
      version: null,
    }),
    [description, name, selectedProductIds, slug, t, theme],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        (product.sku?.toLowerCase().includes(query) ?? false),
    );
  }, [products, search]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug((current) =>
      current === slugify(name) || current === "" ? slugify(value) : current,
    );
  }

  function toggleProduct(id: string) {
    setSelectedProductIds((current) =>
      current.includes(id)
        ? current.filter((productId) => productId !== id)
        : [...current, id],
    );
  }

  function validate(): string | null {
    if (!name.trim()) return t("storefront.builder.error.nameRequired");
    if (!slug.trim()) return t("storefront.builder.error.slugRequired");
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return t("storefront.builder.error.slugFormat");
    }
    if (selectedProductIds.length === 0) {
      return t("storefront.builder.error.productRequired");
    }
    return null;
  }

  function createAndOpenStudio() {
    const validation = validate();
    if (validation) {
      toast.error(validation);
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
            isActive: false,
          }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: unknown;
          };
          throw new Error(
            translateServerError(
              data.error,
              t,
              t("storefront.builder.error.createFailed"),
            ),
          );
        }
        const data = (await response.json()) as { config: { id: string } };
        toast.success(t("storefront.builder.created"));
        router.push(`/storefronts/${encodeURIComponent(data.config.id)}`);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("storefront.builder.error.generic"),
        );
      }
    });
  }

  return (
    <div
      data-storefront-studio="bootstrap"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background"
    >
      <header className="flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon-sm">
            <Link href="/storefronts" aria-label={t("storefront.builder.back")}>
              <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
            </Link>
          </Button>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/8 text-primary">
            <Store className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {t("storefronts.newTitle")}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {t("storefronts.newDesc")}
            </p>
          </div>
        </div>
        <Button onClick={createAndOpenStudio} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {t("storefront.builder.create")}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[23rem_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-e bg-muted/10 p-4">
          <div className="space-y-5">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {t("storefront.builder.generalInfo")}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("storefronts.newDesc")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="studio-name">
                  {t("storefront.builder.shopName")} *
                </Label>
                <Input
                  id="studio-name"
                  value={name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder={t("storefront.builder.shopNamePlaceholder")}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="studio-slug">
                  {t("storefront.builder.slug")} *
                </Label>
                <div className="flex items-center gap-2 rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/25">
                  <span
                    dir="ltr"
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    /storefront/
                  </span>
                  <input
                    id="studio-slug"
                    dir="ltr"
                    value={slug}
                    onChange={(event) => setSlug(slugify(event.target.value))}
                    className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
                    maxLength={50}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="studio-description">
                  {t("storefront.builder.description")}
                </Label>
                <Textarea
                  id="studio-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("storefront.builder.descriptionPlaceholder")}
                  maxLength={500}
                  rows={3}
                />
              </div>
            </section>

            <section className="border-t pt-4">
              <h3 className="text-sm font-semibold">
                {t("storefront.builder.appearance")}
              </h3>
              <div className="mt-3 grid gap-2">
                {STOREFRONT_TEMPLATE_IDS.map((id) => {
                  const selected = template === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setTemplate(id)}
                      className={`rounded-xl border p-3 text-start transition ${
                        selected
                          ? "border-primary bg-primary/8 ring-1 ring-primary/20"
                          : "bg-background hover:bg-muted/50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">
                          {t(TEMPLATE_COPY[id].label)}
                        </span>
                        {selected ? (
                          <Check
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {t(TEMPLATE_COPY[id].description)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="border-t pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {t("storefront.builder.productsDisplayed")} *
                </h3>
                <Badge variant="secondary">
                  {t("storefront.builder.selectedCount", {
                    count: selectedProductIds.length,
                  })}
                </Badge>
              </div>
              <div className="relative mt-3">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("storefront.builder.searchProduct")}
                  className="ps-9"
                />
              </div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border bg-background p-1">
                {filteredProducts.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    {products.length === 0
                      ? t("storefront.builder.noActiveProducts")
                      : t("storefront.builder.noMatchingProducts")}
                  </p>
                ) : (
                  filteredProducts.map((product) => {
                    const selected = selectedProductIds.includes(product.id);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleProduct(product.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start transition ${
                          selected ? "bg-primary/8" : "hover:bg-muted/60"
                        }`}
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input"
                          }`}
                        >
                          {selected ? (
                            <Check className="size-3" aria-hidden="true" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {product.name}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {product.stock}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </aside>

        <main className="min-h-0 overflow-auto bg-muted/20 p-4 lg:p-6">
          <div className="mx-auto min-h-full max-w-6xl overflow-hidden rounded-xl border bg-background shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2.5">
              <div>
                <p className="text-xs font-semibold">
                  {t("storefront.studio.preview")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t("storefronts.newDesc")}
                </p>
              </div>
              <Badge variant="outline">{t(TEMPLATE_COPY[template].label)}</Badge>
            </div>
            <StorefrontRenderer
              draft={draft}
              products={products}
              maxProducts={8}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
