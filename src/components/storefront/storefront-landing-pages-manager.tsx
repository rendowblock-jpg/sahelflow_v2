"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  FileStack,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import { formatDZD } from "@/lib/utils";

export interface LandingPageRow {
  id: string;
  storefrontSlug: string;
  productId: string;
  productName: string;
  slug: string;
  name: string;
  status: string;
  imageGap: number;
  imageCount: number;
  views: number;
  publishedAt: Date | null;
  createdAt: Date;
  stats: {
    views: number;
    orders: number;
    revenue: number;
    conversionRate: number | null;
  };
}

export interface LandingPageImageRow {
  id: string;
  url: string;
  altText: string | null;
  position: number;
  width: number | null;
  height: number | null;
}

interface Props {
  pages: LandingPageRow[];
  storefronts: { slug: string; name: string }[];
  products: { id: string; name: string }[];
  canManage: boolean;
}

type ApiPayload = { error?: string; code?: string; ok?: boolean; url?: string };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  archived: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
};

/**
 * FD-061 EX-4: seller management of per-product landing pages — create,
 * lifecycle (publish/unpublish/archive), duplicate (fresh draft, zeroed
 * counters), the guarded delete, the image stack (upload via the WebP
 * pipeline, reorder, reference-counted delete) and the per-product sibling
 * comparison. Evaluation/stats semantics live in the service — this
 * surface only writes configuration and reads stats.
 */
export function StorefrontLandingPagesManager({ pages, storefronts, products, canManage }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // FD-061 EX-4: sibling comparison — per-product grouping of every page
  // with its stats (the research contract's compare view; no formal A/B).
  const [grouped, setGrouped] = useState(false);
  const [form, setForm] = useState({
    slug: storefronts[0]?.slug ?? "",
    productId: "",
    name: "",
    pageSlug: "",
    imageGap: "0",
  });

  function formatPercent(rate: number | null): string {
    if (rate === null) return "—";
    return `${(rate * 100).toFixed(1)}%`;
  }

  async function createPage(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/storefront/landing-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storefrontSlug: form.slug,
          productId: form.productId,
          name: form.name,
          ...(form.pageSlug.trim() ? { slug: form.pageSlug.trim() } : {}),
          imageGap: Number(form.imageGap) || 0,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) {
        toast.error(data.error ?? t("storefronts.landing.error"));
        return;
      }
      toast.success(t("storefronts.landing.createdToast"));
      setCreating(false);
      setForm((current) => ({ ...current, name: "", pageSlug: "" }));
      router.refresh();
    } catch {
      toast.error(t("storefronts.landing.error"));
    } finally {
      setBusy(false);
    }
  }

  async function mutate(id: string, action: "publish" | "unpublish" | "archive" | "duplicate" | "delete"): Promise<void> {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const response =
        action === "delete"
          ? await fetch(`/api/storefront/landing-pages/${encodeURIComponent(id)}`, { method: "DELETE" })
          : action === "duplicate"
            ? await fetch(`/api/storefront/landing-pages/${encodeURIComponent(id)}/duplicate`, { method: "POST" })
            : await fetch(`/api/storefront/landing-pages/${encodeURIComponent(id)}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
              });
      const data = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) {
        toast.error(data.error ?? t("storefronts.landing.error"));
        return;
      }
      toast.success(t(`storefronts.landing.${action}Toast`));
      router.refresh();
    } catch {
      toast.error(t("storefronts.landing.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("storefronts.landing.title")}</CardTitle>
          <CardDescription>{t("storefronts.landing.description")}</CardDescription>
        </div>
        {canManage && storefronts.length > 0 && products.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={grouped ? "default" : "outline"}
              onClick={() => setGrouped((value) => !value)}
            >
              {t("storefronts.landing.compareToggle")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreating((value) => !value)}>
              <Plus className="size-4" aria-hidden="true" />
              {t("storefronts.landing.create")}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {creating ? (
          <form onSubmit={createPage} className="grid gap-3 rounded-control border bg-muted/30 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lp-storefront">{t("storefronts.landing.storefront")}</Label>
              <select
                id="lp-storefront"
                value={form.slug}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                className="h-9 w-full rounded-control border bg-background px-3 text-sm"
              >
                {storefronts.map((storefront) => (
                  <option key={storefront.slug} value={storefront.slug}>
                    {storefront.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-product">{t("storefronts.landing.product")}</Label>
              <select
                id="lp-product"
                value={form.productId}
                onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                className="h-9 w-full rounded-control border bg-background px-3 text-sm"
                required
              >
                <option value="" disabled>
                  {t("storefronts.landing.productPlaceholder")}
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-page-name">{t("storefronts.landing.name")}</Label>
              <Input
                id="lp-page-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                minLength={2}
                maxLength={200}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lp-page-slug">{t("storefronts.landing.pageSlug")}</Label>
                <Input
                  id="lp-page-slug"
                  value={form.pageSlug}
                  onChange={(event) => setForm((current) => ({ ...current, pageSlug: event.target.value }))}
                  placeholder={t("storefronts.landing.pageSlugPlaceholder")}
                  pattern="[a-z0-9-]{3,60}"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp-image-gap">{t("storefronts.landing.imageGap")}</Label>
                <Input
                  id="lp-image-gap"
                  type="number"
                  min={0}
                  max={200}
                  value={form.imageGap}
                  onChange={(event) => setForm((current) => ({ ...current, imageGap: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy || !form.productId}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {t("storefronts.landing.submit")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
                {t("storefronts.landing.cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        {pages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("storefronts.landing.empty")}</p>
        ) : grouped ? (
          <div className="space-y-4">
            {[...new Set(pages.map((page) => page.productId))].map((productId) => {
              const siblings = pages.filter((page) => page.productId === productId);
              return (
                <div key={productId} className="rounded-control border p-3">
                  <p className="mb-2 text-sm font-medium">{siblings[0]?.productName}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {siblings.map((page) => (
                        <tr key={page.id} className="border-b last:border-b-0">
                          <td className="py-2 font-medium">{page.name}</td>
                          <td className="py-2">
                            <Badge variant="outline" className={STATUS_STYLES[page.status] ?? ""}>
                              {t(`storefronts.landing.status.${page.status}`)}
                            </Badge>
                          </td>
                          <td className="py-2 tabular-nums">{t("storefronts.landing.views")}: {page.stats.views}</td>
                          <td className="py-2 tabular-nums">{t("storefronts.landing.orders")}: {page.stats.orders}</td>
                          <td className="py-2 tabular-nums">{t("storefronts.landing.cvr")}: {formatPercent(page.stats.conversionRate)}</td>
                          <td className="py-2 text-end tabular-nums">{formatDZD(page.stats.revenue, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-muted-foreground">
                  <th className="py-2 text-start font-medium">{t("storefronts.landing.name")}</th>
                  <th className="py-2 text-start font-medium">{t("storefronts.landing.product")}</th>
                  <th className="py-2 text-start font-medium">{t("storefronts.landing.status")}</th>
                  <th className="py-2 text-start font-medium">{t("storefronts.landing.views")}</th>
                  <th className="py-2 text-start font-medium">{t("storefronts.landing.orders")}</th>
                  <th className="py-2 text-start font-medium">{t("storefronts.landing.cvr")}</th>
                  <th className="py-2 text-start font-medium">{t("storefronts.landing.revenue")}</th>
                  <th className="py-2 text-end font-medium">{t("storefronts.landing.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id} className="border-b last:border-b-0">
                    <td className="py-2.5">
                      <span className="font-medium">{page.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">/{page.slug}</span>
                    </td>
                    <td className="py-2.5">{page.productName}</td>
                    <td className="py-2.5">
                      <Badge variant="outline" className={STATUS_STYLES[page.status] ?? ""}>
                        {t(`storefronts.landing.status.${page.status}`)}
                      </Badge>
                    </td>
                    <td className="py-2.5 tabular-nums">{page.stats.views}</td>
                    <td className="py-2.5 tabular-nums">{page.stats.orders}</td>
                    <td className="py-2.5 tabular-nums">{formatPercent(page.stats.conversionRate)}</td>
                    <td className="py-2.5 tabular-nums">{formatDZD(page.stats.revenue, locale)}</td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {page.status === "published" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            asChild
                            aria-label={t("storefronts.landing.viewPublic")}
                          >
                            <a
                              href={`/storefront/${page.storefrontSlug}/lp/${page.slug}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                          </Button>
                        ) : null}
                        {canManage ? (
                          <>
                            {page.status === "published" ? (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mutate(page.id, "unpublish")}>
                                {t("storefronts.landing.unpublish")}
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mutate(page.id, "publish")}>
                                {t("storefronts.landing.publish")}
                              </Button>
                            )}
                            {page.status !== "archived" ? (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mutate(page.id, "archive")} aria-label={t("storefronts.landing.archive")}>
                                <Archive className="size-4" aria-hidden="true" />
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mutate(page.id, "duplicate")} aria-label={t("storefronts.landing.duplicate")}>
                              <Copy className="size-4" aria-hidden="true" />
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setExpandedId((current) => (current === page.id ? null : page.id))} aria-label={t("storefronts.landing.manageImages")}>
                              <FileStack className="size-4" aria-hidden="true" />
                              <span className="ms-1 tabular-nums">{page.imageCount}</span>
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mutate(page.id, "delete")} aria-label={t("storefronts.landing.delete")}>
                              <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expandedId ? (
          <LandingPageImageEditor
            page={pages.find((candidate) => candidate.id === expandedId) ?? null}
            canManage={canManage}
            onDone={() => setExpandedId(null)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function LandingPageImageEditor({
  page,
  canManage,
  onDone,
}: {
  page: LandingPageRow | null;
  canManage: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [images, setImages] = useState<LandingPageImageRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadImages(): Promise<void> {
    if (!page) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/storefront/landing-pages/${encodeURIComponent(page.id)}/images`,
      );
      const data = (await response.json().catch(() => ({}))) as { images?: LandingPageImageRow[] };
      setImages(data.images ?? []);
    } catch {
      toast.error(t("storefronts.landing.error"));
    } finally {
      setBusy(false);
    }
  }

  // Load on first expand.
  if (images === null && !busy && page) {
    void loadImages();
  }

  async function uploadAndAttach(file: File): Promise<void> {
    if (!page || !canManage || busy) return;
    setBusy(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("type", "image");
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: uploadForm,
      });
      const uploadData = (await uploadResponse.json().catch(() => ({}))) as ApiPayload;
      if (!uploadResponse.ok || !uploadData.url) {
        toast.error(uploadData.error ?? t("storefronts.landing.error"));
        return;
      }
      const attachResponse = await fetch(
        `/api/storefront/landing-pages/${encodeURIComponent(page.id)}/images`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: uploadData.url }),
        },
      );
      if (!attachResponse.ok) {
        const attachData = (await attachResponse.json().catch(() => ({}))) as ApiPayload;
        toast.error(attachData.error ?? t("storefronts.landing.error"));
        return;
      }
      toast.success(t("storefronts.landing.imageAddedToast"));
      await loadImages();
      router.refresh();
    } catch {
      toast.error(t("storefronts.landing.error"));
    } finally {
      setBusy(false);
    }
  }

  async function moveImage(index: number, direction: -1 | 1): Promise<void> {
    if (!page || !images || !canManage || busy) return;
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setImages(next);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/storefront/landing-pages/${encodeURIComponent(page.id)}/images/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageIds: next.map((image) => image.id) }),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiPayload;
        toast.error(data.error ?? t("storefronts.landing.error"));
        await loadImages();
        return;
      }
      router.refresh();
    } catch {
      toast.error(t("storefronts.landing.error"));
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: string): Promise<void> {
    if (!page || !canManage || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/storefront/landing-pages/${encodeURIComponent(page.id)}/images/${encodeURIComponent(imageId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiPayload;
        toast.error(data.error ?? t("storefronts.landing.error"));
        return;
      }
      toast.success(t("storefronts.landing.imageDeletedToast"));
      await loadImages();
      router.refresh();
    } catch {
      toast.error(t("storefronts.landing.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!page) return null;
  return (
    <div className="space-y-3 rounded-control border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {t("storefronts.landing.imagesTitle", { name: page.name })}
        </p>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("storefronts.landing.close")}
        </Button>
      </div>
      {canManage ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadAndAttach(file);
              event.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {t("storefronts.landing.uploadImage")}
          </Button>
        </>
      ) : null}
      {images && images.length > 0 ? (
        <ul className="space-y-2">
          {images.map((image, index) => (
            <li key={image.id} className="flex items-center gap-3 rounded-control border bg-background p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local immutable uploads preview */}
              <img src={image.url} alt={image.altText ?? ""} className="size-12 rounded object-cover" />
              <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{image.url}</span>
              {canManage ? (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={busy || index === 0} onClick={() => void moveImage(index, -1)} aria-label={t("storefronts.landing.moveUp")}>
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy || index === images.length - 1} onClick={() => void moveImage(index, 1)} aria-label={t("storefronts.landing.moveDown")}>
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeImage(image.id)} aria-label={t("storefronts.landing.deleteImage")}>
                    <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : images && images.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{t("storefronts.landing.imagesEmpty")}</p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">{t("storefronts.landing.imagesLoading")}</p>
      )}
    </div>
  );
}
