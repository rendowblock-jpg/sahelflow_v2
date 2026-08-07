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
  className,
}: EmptyStateProps) {
  const action =
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

  return (
    <StateSurface
      icon={icon}
      title={title}
      description={description}
      actions={action}
      size="panel"
      className={className}
    />
  );
}
