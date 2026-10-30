"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import {
  StateSurface,
  type StateKind,
  type StateSurfaceSize,
  type StateSurfaceTone,
} from "@/components/shared/state-surface";
import { formatStateClock } from "@/components/shared/state-time";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

type StateIcon = React.ComponentType<{ className?: string }>;

export interface StateViewProps {
  kind: StateKind;
  /** Overrides the localized default title. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: StateIcon;
  size?: StateSurfaceSize;
  tone?: StateSurfaceTone;
  /** Empty: the next action for the seller (a button, a dialog trigger). */
  action?: React.ReactNode;
  /** Error: extra buttons after Retry (for example "Reload page"). */
  extraActions?: React.ReactNode;
  /** Error: shows Retry and calls this (reset / refetch). */
  onRetry?: () => void;
  /** Partial: shows Refresh and calls this. */
  onRefresh?: () => void;
  /** Partial and offline: when the data we show was last saved. */
  lastUpdated?: Date | number | string | null;
  /** Error: shown as a muted "Error code" line, only when present. */
  digest?: string | null;
  className?: string;
  testId?: string;
  retryTestId?: string;
}

/**
 * The localized face of the five-state kit. All copy comes from the locale
 * files (ar/fr/en); callers pass their own title/description only when the
 * generic wording is not enough.
 */
export function StateView({
  kind,
  title,
  description,
  icon,
  size,
  tone,
  action,
  extraActions,
  onRetry,
  onRefresh,
  lastUpdated,
  digest,
  className,
  testId,
  retryTestId,
}: StateViewProps) {
  const { t, locale } = useI18n();
  const time =
    lastUpdated !== undefined && lastUpdated !== null
      ? formatStateClock(lastUpdated, locale)
      : "";

  let resolvedTitle: React.ReactNode = title;
  let resolvedDescription: React.ReactNode = description;
  let actions: React.ReactNode = null;

  switch (kind) {
    case "loading":
      resolvedTitle ??= t("state.loading.title");
      break;
    case "empty":
      resolvedTitle ??= t("state.empty.title");
      resolvedDescription ??= t("state.empty.description");
      actions = action ?? null;
      break;
    case "error":
      resolvedTitle ??= t("state.error.title");
      resolvedDescription = (
        <>
          <p>{description ?? t("state.error.description")}</p>
          {digest ? (
            <p
              data-testid="state-error-code"
              className="mt-1.5 text-xs text-muted-foreground"
            >
              {t("state.error.code", { code: digest })}
            </p>
          ) : null}
        </>
      );
      actions =
        onRetry || extraActions ? (
          <>
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                data-testid={retryTestId ?? "state-retry"}
              >
                <RefreshCw className="me-2 size-4" aria-hidden="true" />
                {t("error.retry")}
              </Button>
            ) : null}
            {extraActions}
          </>
        ) : null;
      break;
    case "partial":
      resolvedTitle ??= time
        ? t("state.partial.message", { time })
        : t("state.partial.messageNoTime");
      actions = onRefresh ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          data-testid="state-refresh"
        >
          <RefreshCw className="me-2 size-4" aria-hidden="true" />
          {t("state.partial.refresh")}
        </Button>
      ) : null;
      break;
    case "offline":
      resolvedTitle ??= t("state.offline.message");
      resolvedDescription ??= time
        ? t("state.offline.lastUpdated", { time })
        : undefined;
      break;
  }

  return (
    <StateSurface
      kind={kind}
      icon={icon}
      size={size}
      tone={tone}
      title={resolvedTitle}
      description={resolvedDescription}
      actions={actions}
      className={className}
      testId={testId}
    />
  );
}
