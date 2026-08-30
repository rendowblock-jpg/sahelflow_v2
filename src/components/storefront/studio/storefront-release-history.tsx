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


export function StorefrontReleaseHistory({ storefrontId }: { storefrontId: string }) {
  const { t, locale, dir } = useI18n();
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
      setMessage(t("storefront.releaseHistory.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, storefrontId]);

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
        setMessage(t("storefront.releaseHistory.loadFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [t, storefrontId]);

  const active = useMemo(() => releases.find((release) => release.isActive) ?? null, [releases]);

  const rollback = useCallback(async (source: Release) => {
    if (!active || source.isActive || rollingBack) return;
    if (!window.confirm(t("storefront.releaseHistory.confirm"))) return;
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
      setMessage(t("storefront.releaseHistory.rolledBack"));
    } catch {
      setMessage(t("storefront.releaseHistory.rollbackFailed"));
    } finally {
      setRollingBack(null);
    }
  }, [active, load, rollingBack, storefrontId, t]);

  return (
    <section className="rounded-2xl border bg-background p-4" dir={dir} aria-label={t("storefront.releaseHistory.title")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-xl border bg-muted/40 p-2.5 text-primary">
          <History className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("storefront.releaseHistory.title")}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{t("storefront.releaseHistory.description")}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || rollingBack !== null}
          className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <History className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="sr-only">{t("storefront.releaseHistory.title")}</span>
        </button>
      </div>

      {message ? <p className="mt-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs" role="status">{message}</p> : null}
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("storefront.releaseHistory.loading")}
        </div>
      ) : releases.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("storefront.releaseHistory.empty")}</p>
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
                  <span className="text-2xs uppercase text-muted-foreground">{release.locale}</span>
                  {release.isActive ? <span className="ms-auto rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">{t("storefront.releaseHistory.current")}</span> : null}
                </div>
                <p className="mt-2 text-2xs text-muted-foreground">{dateLabel}</p>
                <p className="mt-1 font-mono text-2xs text-muted-foreground">{release.artifactDigest.slice(0, 12)}… · {release.catalog.length} {t("storefront.releaseHistory.products")}</p>
                {!release.isActive && active ? (
                  <button
                    type="button"
                    disabled={rollingBack !== null}
                    onClick={() => void rollback(release)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-semibold hover:bg-background disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    {busy ? t("storefront.releaseHistory.rollingBack") : t("storefront.releaseHistory.rollback")}
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
