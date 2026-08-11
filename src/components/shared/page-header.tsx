import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Operational work-surface header.
 *
 * The application frame already owns global navigation and search. Page headers
 * therefore identify the current work surface and host contextual actions without
 * becoming oversized marketing heroes. The type scale stays large enough for
 * fast daily scanning in Arabic, French and English.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-4 border-b border-border/70 pb-4 text-start sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      data-slot="page-header"
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/45 text-muted-foreground">
            <Icon className="size-[18px]" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-start text-xl font-semibold leading-7 tracking-tight text-foreground rtl:tracking-normal sm:text-2xl sm:leading-8">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-pretty text-start text-[15px] leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          data-slot="page-actions"
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
