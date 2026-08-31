import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StateSurface } from "@/components/shared/state-surface";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  /**
   * Explicit action node. When provided it overrides the actionLabel/onAction/
   * actionHref composition, letting a call site mount a richer CTA (for
   * example a dialog trigger) as the first-use primary action.
   */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Canonical first-use/no-data state.
 *
 * Phase 5 removes the oversized dashed "marketing empty state" treatment and
 * routes empty-state composition through the same persistent state surface used
 * for degraded/error/recovery experiences. Filtered-empty, permission, offline
 * and recovery states remain distinct callers rather than being mislabeled as
 * ordinary empty data.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  action,
  className,
}: EmptyStateProps) {
  const composedAction =
    actionLabel && (actionHref || onAction) ? (
      actionHref ? (
        <Button asChild size="sm">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )
    ) : null;
  const actionNode = action ?? composedAction;

  return (
    <StateSurface
      icon={icon}
      title={title}
      description={description}
      actions={actionNode}
      size="panel"
      className={className}
    />
  );
}
