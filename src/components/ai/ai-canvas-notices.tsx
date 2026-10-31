"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AiWorkspaceError } from "@/components/ai/ai-workspace-types";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { getAiQuotaRuntimeTranslation } from "@/lib/i18n/ai-quota-runtime";
import type { Locale } from "@/lib/i18n";
import type { QuotaStateWire } from "@/lib/ai/providers/quota-state";

/**
 * The three canvas notices — setup, failure and the shop-wide approval loop.
 * Each is one slim line inside the reading column (never a full-bleed band),
 * so the conversation keeps its measure and the notice reads as part of it.
 */
function errorMessage(
  error: AiWorkspaceError,
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  switch (error.code) {
    case "AI_CONSENT_REQUIRED":
      return workspace.copy("consentMissing");
    case "AI_LICENSE_REQUIRED":
      return workspace.copy("licenseRequired");
    case "AI_RATE_LIMITED":
      return workspace.copy("rateLimited");
    case "AI_INVALID_MESSAGE":
    case "AI_INVALID_REQUEST":
      return workspace.copy("invalidMessage");
    case "AI_ATTACHMENT_INVALID":
      return workspace.copy("imageRejected");
    case "AI_SESSION_NOT_FOUND":
      return workspace.copy("sessionMissing");
    case "AI_RESPONSE_NOT_PERSISTED":
      return workspace.copy("responseNotPersisted");
    case "AI_SESSION_LOAD_FAILED":
      return workspace.copy("conversationLoadFailed");
    case "AI_SESSION_CREATE_FAILED":
      return workspace.copy("sessionCreateFailed");
    case "AI_PROVIDER_UNAVAILABLE":
      return workspace.copy("providerDegraded");
    case "AI_PROVIDER_REPORTED":
      // F-09: the server's locale-native verdict IS the notice text — no
      // invented title on top of it. Falls back to the degraded copy only if
      // an older paired server sent an empty message.
      return error.detail && error.detail.trim()
        ? error.detail
        : workspace.copy("providerDegraded");
    case "AI_STREAM_TIMEOUT":
      return workspace.copy("streamTimeout");
    default:
      return workspace.copy("genericError");
  }
}

/**
 * The free-limit notice. The status route sends `quota`; the setup type in
 * ai-workspace-types.ts does not name it yet, so it is read defensively here.
 */
export function quotaOf(setup: unknown): QuotaStateWire | undefined {
  const quota = (setup as { quota?: QuotaStateWire } | null | undefined)?.quota;
  return quota && typeof quota === "object" && typeof quota.kind === "string" ? quota : undefined;
}

function formatResetTime(at: string, locale: Locale, now: Date): string {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return "";
  const tag = locale === "ar" ? "ar-DZ-u-nu-latn" : locale === "fr" ? "fr-FR" : "en-GB";
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(tag, {
    ...(sameDay ? {} : { day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** One calm sentence for a paused or nearly used free limit; null when there is nothing to say. */
export function quotaNoticeText(quota: QuotaStateWire | undefined, locale: Locale, now: Date = new Date()): string | null {
  if (!quota) return null;
  const say = (key: string, params: Record<string, string>) => {
    const template = getAiQuotaRuntimeTranslation(locale, key) ?? "";
    return Object.entries(params).reduce((text, [name, value]) => text.split(`{{${name}}}`).join(value), template);
  };
  if (quota.kind === "paused") {
    const time = formatResetTime(quota.until, locale, now);
    return time ? say(quota.untilKnown ? "aiQuota.paused" : "aiQuota.pausedApprox", { time }) : null;
  }
  if (quota.kind === "all_paused") {
    const time = formatResetTime(quota.resumeAt, locale, now);
    return time ? say(quota.resumeKnown ? "aiQuota.paused" : "aiQuota.pausedApprox", { time }) : null;
  }
  if (quota.kind === "low") return say("aiQuota.low", { left: String(quota.left) });
  return null;
}

export function QuotaNotice({
  quota,
  locale,
  action,
  now,
}: {
  quota: QuotaStateWire | undefined;
  locale: Locale;
  action?: ReactNode;
  now?: Date;
}) {
  const text = quotaNoticeText(quota, locale, now);
  if (!text) return null;
  return (
    <div
      role="status"
      data-ai-quota-notice={quota?.kind}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-muted/40 px-3.5 py-2.5"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 text-body-sm">{text}</p>
      </div>
      {action}
    </div>
  );
}

/** For settings: asks the status route itself and shows nothing when it cannot be read. */
export function QuotaNoticeFromStatus({ locale }: { locale: Locale }) {
  const [quota, setQuota] = useState<QuotaStateWire | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/ai/status", { cache: "no-store" });
        if (!response.ok) return;
        const found = quotaOf(await response.json());
        if (!cancelled) setQuota(found);
      } catch {
        // no notice rather than a guessed one
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return <QuotaNotice quota={quota} locale={locale} />;
}

function SetupNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { setup, setupError, refreshSetup, locale } = workspace;
  if (setup?.ready === true) {
    const quota = quotaOf(setup);
    if (!quotaNoticeText(quota, locale)) return null;
    return (
      <div className="sf-ai-column pt-3">
        <QuotaNotice
          quota={quota}
          locale={locale}
          action={
            <Button asChild variant="outline" size="sm" className="bg-card">
              <Link href="/settings?group=intelligence">
                <Settings2 className="size-4" aria-hidden="true" />
                {workspace.copy("openSettings")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!setup && !setupError) {
    return (
      <div className="sf-ai-column pt-3">
        <p className="flex items-center gap-2 text-caption text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {getAiDecisionCopy(locale, "setupChecking")}
        </p>
      </div>
    );
  }

  return (
    <div className="sf-ai-column pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-warning/25 bg-warning-subtle px-3.5 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-body-sm font-semibold">
              {setupError
                ? workspace.copy("setupUnavailable")
                : getAiDecisionCopy(locale, "setupAttention")}
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {setupError
                ? workspace.copy("setupUnavailableDescription")
                : !setup?.consentAccepted
                  ? workspace.copy("consentMissing")
                  : workspace.copy("keyMissing")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {setupError ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void refreshSetup()}>
              <RefreshCw className="size-4" aria-hidden="true" />
              {workspace.copy("retry")}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="bg-card">
            <Link href="/settings?group=intelligence">
              <Settings2 className="size-4" aria-hidden="true" />
              {workspace.copy("openSettings")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { error, retry, setup, refreshSetup, locale } = workspace;
  const providerFailure = error?.code === "AI_PROVIDER_REPORTED" || error?.code === "AI_PROVIDER_UNAVAILABLE";
  // A provider failure may be a quota stop: ask the status again, and let the calm notice speak if it is.
  useEffect(() => {
    if (providerFailure) void refreshSetup?.();
  }, [providerFailure, error, refreshSetup]);
  if (!error) return null;
  if (providerFailure && quotaNoticeText(quotaOf(setup), locale) !== null && quotaOf(setup)?.kind !== "low") return null;
  const persistenceOnly = error.code === "AI_RESPONSE_NOT_PERSISTED";

  return (
    <div className="sf-ai-column pt-3">
      <div
        role="alert"
        className="flex items-start justify-between gap-3 rounded-surface border border-destructive/25 bg-destructive-subtle px-3.5 py-2.5"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <p dir="auto" className="text-body-sm font-semibold">
              {errorMessage(error, workspace)}
            </p>
            {error.detail && error.code !== "AI_PROVIDER_REPORTED" ? (
              // AI_PROVIDER_REPORTED already renders the server message as the
              // title — repeating it as the sub-line would duplicate the text.
              <p dir="auto" className="mt-0.5 text-caption text-muted-foreground">
                {error.detail}
              </p>
            ) : null}
          </div>
        </div>
        {!persistenceOnly ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => void retry()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {workspace.copy("retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Ledger F-06 — the shop-wide approval loop, surfaced where the seller works.
 * Pending sensitive actions exist across ALL sessions; without this line they
 * were invisible unless the seller already knew to open review. Hidden while
 * the review column owns the surface (wideReview) and while the inbox is
 * loading or failed — honest absence, never a fake "all clear".
 */
function InboxStrip({
  workspace,
  wideReview,
  onOpenReview,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  wideReview: boolean;
  onOpenReview: () => void;
}) {
  const { inbox, inboxLoading, inboxError, locale } = workspace;
  if (wideReview || inboxLoading || inboxError || inbox.length === 0) {
    return null;
  }
  return (
    <div className="sf-ai-column pt-3">
      <div
        data-ai-inbox-strip="true"
        className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-card px-3.5 py-2.5"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-body-sm font-semibold">
              {getAiDecisionCopy(locale, "inboxStripCount", { count: inbox.length })}
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {getAiDecisionCopy(locale, "inboxStripDescription")}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={onOpenReview}>
          {getAiDecisionCopy(locale, "inboxStripOpen")}
        </Button>
      </div>
    </div>
  );
}

export { ErrorNotice, InboxStrip, SetupNotice };
