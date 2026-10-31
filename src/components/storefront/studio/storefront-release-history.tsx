"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, History, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CardGridSkeletonBody, SkeletonShell } from "@/components/shared/state-skeletons";
import { StateView } from "@/components/shared/state-view";
import { resolveHistoryView } from "@/components/storefront/studio/release-history-view";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontTemplateId } from "@/lib/storefront/presentation-types";
import { DZ_CLOCK, intlLocale } from "@/lib/utils";

type Release = Readonly<{
  releaseId: string;
  parentReleaseId: string | null;
  templateId: StorefrontTemplateId;
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
  connected?: boolean;
  error?: string;
}>;

type LoadedHistory = Readonly<{
  releases: readonly Release[];
  connected: boolean;
}>;

const STATE_PREFIX = "storefront.studioStates.history.";
/** How many versions the page lists; older ones stay on the service. */
const VISIBLE_RELEASES = 12;

function formatReleaseDate(createdAt: string, locale: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    ...DZ_CLOCK,
  });
}

/** The one name a seller can recognise a version by: template, date, digest. */
function releaseLabel(release: Release, dateLabel: string): string {
  return `${release.templateId} · ${dateLabel} · ${release.artifactDigest.slice(0, 12)}`;
}

export function StorefrontReleaseHistory({ storefrontId }: { storefrontId: string }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<LoadedHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<Release | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/storefront/config/${encodeURIComponent(storefrontId)}/releases`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json()) as HistoryResponse;
        if (!response.ok || !body.history) {
          throw new Error(body.error ?? "release_history_unavailable");
        }
        if (controller.signal.aborted) return;
        setData({ releases: body.history.releases, connected: body.connected !== false });
        setLoadFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        setLoadFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [storefrontId, reloadKey]);

  const releases = useMemo(() => data?.releases ?? [], [data]);
  const active = useMemo(() => releases.find((release) => release.isActive) ?? null, [releases]);
  const view = resolveHistoryView({
    loading,
    hasData: data !== null,
    loadFailed,
    connected: data?.connected ?? true,
    count: releases.length,
  });

  const performRollback = useCallback(
    async (source: Release) => {
      if (!active || source.isActive || rollingBack) return;
      setRollingBack(source.releaseId);
      setNotice(null);
      setRollbackError(null);
      // 0 = no answer at all: the outcome is unknown, so say that.
      let status = 0;
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
        status = response.status;
        if (!response.ok) throw new Error("rollback_failed");
        setNotice(t("storefront.releaseHistory.rolledBack"));
        reload();
      } catch {
        if (status === 0) {
          setRollbackError(t(`${STATE_PREFIX}rollbackUnknown`));
          reload();
        } else if (status === 409) {
          setRollbackError(t(`${STATE_PREFIX}rollbackConflict`));
          reload();
        } else {
          setRollbackError(t(`${STATE_PREFIX}rollbackFailed`));
        }
      } finally {
        setRollingBack(null);
      }
    },
    [active, reload, rollingBack, storefrontId, t],
  );

  const targetLabel = rollbackTarget
    ? releaseLabel(rollbackTarget, formatReleaseDate(rollbackTarget.createdAt, locale))
    : "";

  return (
    <section className="rounded-surface border bg-background p-4" aria-busy={loading}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-surface border bg-muted/40 p-2.5 text-primary">
          <History className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("storefront.releaseHistory.title")}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {t("storefront.releaseHistory.description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reload}
          disabled={loading || rollingBack !== null}
          aria-label={t(`${STATE_PREFIX}refresh`)}
          data-testid="release-history-refresh"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {notice ? (
        <p className="mt-3 rounded-surface border bg-muted/30 px-3 py-2 text-xs" role="status">
          {notice}
        </p>
      ) : null}
      {rollbackError ? (
        <p
          className="mt-3 rounded-surface border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
          role="alert"
        >
          {rollbackError}
        </p>
      ) : null}
      {view.stale ? (
        <StateView
          kind="partial"
          size="banner"
          title={t(`${STATE_PREFIX}staleTitle`)}
          onRefresh={reload}
          className="mt-3"
          testId="release-history-stale"
        />
      ) : null}

      {view.body === "loading" ? (
        <SkeletonShell className="mt-3" testId="release-history-loading">
          <CardGridSkeletonBody cards={3} columns={3} />
        </SkeletonShell>
      ) : null}

      {view.body === "error" ? (
        <StateView
          kind="error"
          size="panel"
          title={t(`${STATE_PREFIX}loadFailedTitle`)}
          description={t(`${STATE_PREFIX}loadFailedBody`)}
          onRetry={reload}
          className="mt-3"
          testId="release-history-error"
        />
      ) : null}

      {view.body === "empty" ? (
        <StateView
          kind="empty"
          size="panel"
          icon={History}
          title={t(`${STATE_PREFIX}emptyTitle`)}
          description={t(`${STATE_PREFIX}emptyBody`)}
          action={
            <Button asChild size="sm">
              <Link href={`/storefronts/${encodeURIComponent(storefrontId)}/studio`}>
                {t(`${STATE_PREFIX}openStudio`)}
              </Link>
            </Button>
          }
          className="mt-3"
          testId="release-history-empty"
        />
      ) : null}

      {view.body === "notConnected" ? (
        <StateView
          kind="empty"
          size="panel"
          icon={History}
          title={t(`${STATE_PREFIX}notConnectedTitle`)}
          description={t(`${STATE_PREFIX}notConnectedBody`)}
          className="mt-3"
          testId="release-history-not-connected"
        />
      ) : null}

      {view.body === "list" ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {releases.slice(0, VISIBLE_RELEASES).map((release) => {
            const dateLabel = formatReleaseDate(release.createdAt, locale);
            const busy = rollingBack === release.releaseId;
            return (
              <article
                key={release.releaseId}
                data-testid={`release-card-${release.releaseId}`}
                className={`rounded-surface border p-3 ${release.isActive ? "border-primary/50 bg-primary-subtle" : "bg-muted/20"}`}
              >
                <div className="flex items-center gap-2">
                  {release.isActive ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="text-xs font-semibold capitalize">{release.templateId}</span>
                  <span className="text-caption uppercase text-muted-foreground">{release.locale}</span>
                  {release.isActive ? (
                    <span className="ms-auto rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary">
                      {t("storefront.releaseHistory.current")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-caption text-muted-foreground">{dateLabel}</p>
                <p className="mt-1 font-mono text-caption text-muted-foreground">
                  {release.artifactDigest.slice(0, 12)}… · {release.catalog.length}{" "}
                  {t("storefront.releaseHistory.products")}
                </p>
                {!release.isActive && active ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={rollingBack !== null}
                    onClick={() => setRollbackTarget(release)}
                    aria-label={t(`${STATE_PREFIX}rollbackAria`, {
                      release: releaseLabel(release, dateLabel),
                    })}
                    data-testid={`release-rollback-${release.releaseId}`}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="size-4" aria-hidden="true" />
                    )}
                    {busy ? t("storefront.releaseHistory.rollingBack") : t("storefront.releaseHistory.rollback")}
                  </Button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <ConfirmDialog
        open={rollbackTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null);
        }}
        title={t(`${STATE_PREFIX}rollbackTitle`)}
        description={t(`${STATE_PREFIX}rollbackBody`, { release: targetLabel })}
        confirmLabel={t(`${STATE_PREFIX}rollbackConfirm`)}
        cancelLabel={t(`${STATE_PREFIX}rollbackCancel`)}
        destructive
        onConfirm={() => {
          const target = rollbackTarget;
          setRollbackTarget(null);
          if (target) void performRollback(target);
        }}
      />
    </section>
  );
}
