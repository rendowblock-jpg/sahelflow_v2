import * as React from "react";

import { cn } from "@/lib/utils";
import { IconTile } from "@/components/system";

export type PageHeaderVariant = "document" | "workspace";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  /**
   * `document` sits above a scrolling page body; `workspace` is the compact
   * band a full-height surface (Agents, Inbox) carries above its panes.
   */
  variant?: PageHeaderVariant;
  className?: string;
}

/**
 * Operational work-surface header — the ONE header in the product.
 *
 * The application frame already owns global navigation and search. Page headers
 * therefore identify the current work surface and host contextual actions
 * without becoming oversized marketing heroes.
 *
 * IA-01 — the audit found "two page architectures", and the split ran deeper
 * than which routes opted out: `PageShell` and `PageHeader` each rendered their
 * own header, so the product had two headings with two different type scales.
 * This one is now the only implementation and `PageShell` composes it, which is
 * what makes the page grammar single rather than merely documented.
 *
 * The heading also joins the type ramp here. It previously hardcoded
 * `text-xl … sm:text-2xl` and set its description to an arbitrary `text-[15px]`,
 * so the most prominent text on 21 routes was the text least governed by
 * INTERFACE_SYSTEM.md §2. It now resolves through `--text-title-1` /
 * `--text-title-2` and `--text-body`, which also gives Arabic its reading floor
 * (`arabic-system.css` scopes its lift to the ramp steps, not to raw sizes).
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  variant = "document",
  className,
}: PageHeaderProps) {
  const workspace = variant === "workspace";

  return (
    <header
      className={cn(
        "flex min-w-0 flex-col text-start sm:flex-row sm:justify-between",
        workspace
          ? "shrink-0 items-start gap-3 border-b border-border/80 px-4 py-3 sm:items-start sm:gap-6"
          : "gap-4 border-b border-border/70 pb-4 sm:items-end",
        className,
      )}
      data-slot="page-header"
      data-page-header-variant={variant}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <IconTile
            icon={Icon}
            size={workspace ? "sm" : "md"}
            bordered
            className={workspace ? undefined : "mt-0.5"}
          />
        ) : null}
        <div className={cn("min-w-0", workspace ? undefined : "space-y-1")}>
          {/*
            Always visible. A page whose only heading is `sr-only` reads to a
            sighted seller as a screen with no name.
          */}
          <h1
            className={cn(
              "min-w-0 text-balance text-start text-foreground rtl:tracking-normal",
              workspace ? "text-title-2" : "text-title-1",
            )}
          >
            {title}
          </h1>
          {description ? (
            <p
              className={cn(
                "text-pretty text-start text-muted-foreground",
                workspace ? "text-caption" : "max-w-3xl text-body",
              )}
            >
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
