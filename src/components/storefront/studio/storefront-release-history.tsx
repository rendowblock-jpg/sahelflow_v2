"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, History, Loader2, RotateCcw } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

type Release = Readonly<{
  releaseId: string;
  parentReleaseId: string | null;
  templateId: "sahara" | "atlas" | "oasis";
  locale: "ar" | "fr" | "en";
  artifactDigest: string;
  createdAt: string;
  isActive: boolean;
  catalog: readonly { itemKey: string; unitPriceDzd: number }[];
}>;

type HistoryResponse = Readonly<{
  history?: Readonly<{
    storefrontId: string;
    releases: readonly Release[];
  }>;
  error?: string;
}>;

const COPY = {
  en: {
    title: "Release history",
    description: "Every publish is immutable. Rollback creates a new release from a verified historical version.",
    current: "Current",
    rollback: "Rollback",
    rollingBack: "Rolling back…",
    confirm: "Publish a new live release from this historical version? Your private Studio draft will stay unchanged.",
    empty: "No published releases yet.",
    loading: "Loading release history…",
    loadFailed: "Could not load release history.",
    rollbackFailed: "Rollback failed. The current live release was kept.",
    rolledBack: "Rollback published as a new immutable release.",
    products: "items",
  },
  fr: {
    title: "Historique des versions",
    description: "Chaque publication est immuable. Le retour arrière crée une nouvelle version depuis une version historique vérifiée.",
    current: "Actuelle",
    rollback: "Restaurer",
    rollingBack: "Restauration…",
    confirm: "Publier une nouvelle version active depuis cette version historique ? Votre brouillon Studio privé restera inchangé.",
    empty: "Aucune version publiée pour le moment.",
    loading: "Chargement de l’historique…",
    loadFailed: "Impossible de charger l’historique des versions.",
    rollbackFailed: "La restauration a échoué. La version active actuelle a été conservée.",
    rolledBack: "La restauration a été publiée comme une nouvelle version immuable.",
    products: "articles",
  },
  ar: {
    title: "سجل الإصدارات",
    description: "كل نشر غير قابل للتعديل. الاسترجاع ينشئ إصدارًا جديدًا من نسخة تاريخية موثّقة.",
    current: "الحالي",
    rollback: "استرجاع",
    rollingBack: "جارٍ الاسترجاع…",
    confirm: "هل تريد نشر إصدار حي جديد من هذه النسخة التاريخية؟ ستبقى مسودة Studio الخاصة بك دون تغيير.",
    empty: "لا توجد إصدارات منشورة بعد.",
    loading: "جارٍ تحميل سجل الإصدارات…",
    loadFailed: "تعذر تحميل سجل الإصدارات.",
    rollbackFailed: "فشل الاسترجاع. تم الإبقاء على الإصدار الحي الحالي.",
    rolledBack: "تم نشر الاسترجاع كإصدار جديد غير قابل للتعديل.",
    products: "عناصر",
  },
} as const;

export function StorefrontReleaseHistory({ storefrontId }: { storefrontId: string }) {
  const { locale, dir } = useI18n();
  const language = locale.startsWith("fr") ? "fr" : locale.startsWith("en") ? "en" : "ar";
  const copy = COPY[language];
  const [releases, setReleases] = useState<readonly Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/storefront/config/${encodeURIComponent(storefrontId)}/releases`,
        { cache: "no-store" },
      );
      const body = await response.json() as HistoryResponse;
      if (!response.ok || !body.history) throw new Error(body.error ?? "release_history_unavailable");
      setReleases(body.history.releases);
      setMessage(null);
    } catch {
      setMessage(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed, storefrontId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/storefront/config/${encodeURIComponent(storefrontId)}/releases`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json() as HistoryResponse;
        if (!response.ok || !body.history) {
          throw new Error(body.error ?? "release_history_unavailable");
        }
        return body.history.releases;
      })
      .then((nextReleases) => {
        if (controller.signal.aborted) return;
        setReleases(nextReleases);
        setMessage(null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMessage(copy.loadFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [copy.loadFailed, storefrontId]);

  const active = useMemo(() => releases.find((release) => release.isActive) ?? null, [releases]);

  const rollback = useCallback(async (source: Release) => {
    if (!active || source.isActive || rollingBack) return;
    if (!window.confirm(copy.confirm)) return;
    setRollingBack(source.releaseId);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/storefront/config/${encodeURIComponent(storefrontId)}/releases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceReleaseId: source.releaseId,
            expectedActiveReleaseId: active.releaseId,
          }),
        },
      );
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "rollback_failed");
      await load();
      setMessage(copy.rolledBack);
    } catch {
      setMessage(copy.rollbackFailed);
    } finally {
      setRollingBack(null);
    }
  }, [active, copy.confirm, copy.rollbackFailed, copy.rolledBack, load, rollingBack, storefrontId]);

  return (
    <section className="rounded-2xl border bg-background p-4" dir={dir} aria-label={copy.title}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-xl border bg-muted/40 p-2.5 text-primary">
          <History className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{copy.description}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || rollingBack !== null}
          className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <History className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="sr-only">{copy.title}</span>
        </button>
      </div>

      {message ? <p className="mt-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs" role="status">{message}</p> : null}
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {copy.loading}
        </div>
      ) : releases.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {releases.slice(0, 12).map((release) => {
            const date = new Date(release.createdAt);
            const dateLabel = Number.isNaN(date.getTime())
              ? release.createdAt
              : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
            const busy = rollingBack === release.releaseId;
            return (
              <article key={release.releaseId} className={`rounded-xl border p-3 ${release.isActive ? "border-primary/50 bg-primary/5" : "bg-muted/20"}`}>
                <div className="flex items-center gap-2">
                  {release.isActive ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-xs font-semibold capitalize">{release.templateId}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">{release.locale}</span>
                  {release.isActive ? <span className="ms-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{copy.current}</span> : null}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{dateLabel}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{release.artifactDigest.slice(0, 12)}… · {release.catalog.length} {copy.products}</p>
                {!release.isActive && active ? (
                  <button
                    type="button"
                    disabled={rollingBack !== null}
                    onClick={() => void rollback(release)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-background disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    {busy ? copy.rollingBack : copy.rollback}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
