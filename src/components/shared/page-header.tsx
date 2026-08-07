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
 * Compact work-surface header.
 *
 * The application frame already owns global navigation and search. Page headers
 * therefore identify the current work surface and host only contextual actions;
 * they are intentionally denser than marketing/SaaS hero headers.
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
        "flex min-w-0 flex-col gap-3 border-b border-border/70 pb-3 text-start sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      data-slot="page-header"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/45 text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-balance text-start text-lg font-semibold leading-6 tracking-tight text-foreground rtl:tracking-normal sm:text-xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-pretty text-start text-sm leading-5 text-muted-foreground">
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
