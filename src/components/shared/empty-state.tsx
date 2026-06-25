import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Premium empty state — taxonomy + Dub pattern.
 * 
 * - min-h-[400px] for consistent vertical space
 * - Dashed border container
 * - Square icon tile (rounded-2xl, not circle)
 * - text-balance for description
 * - Centered, max-w-[420px] content
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center",
      className,
    )}>
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-balance text-sm text-muted-foreground">{description}</p>
        </div>
        {actionLabel && (actionHref || onAction) && (
          <div className="mt-2">
            {actionHref ? (
              <Button asChild>
                <Link href={actionHref}>{actionLabel}</Link>
              </Button>
            ) : (
              <Button onClick={onAction}>{actionLabel}</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
