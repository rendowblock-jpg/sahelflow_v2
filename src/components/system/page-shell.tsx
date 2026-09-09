import * as React from "react";

import { IconTile } from "@/components/system/icon-tile";
import { cn } from "@/lib/utils";

/**
 * The single page grammar.
 *
 * The audit found two page architectures: 21 routes render a `PageHeader`,
 * while Agents and Inbox opted out of the page system entirely and hid their
 * `<h1>` with `sr-only`, so those surfaces carried no visible identity at all
 * (register IA-01). PageShell closes that split — a full-height workspace is a
 * *variant* of the page grammar, not an exemption from it.
 *
 * The shell classes (`app-content`, `app-content-narrow`,
 * `app-workspace-content`) remain the layout authority from
 * `phase5.css` / `experience-system.css`; PageShell composes them rather than
 * re-implementing their geometry.
 *
 * INTERFACE_SYSTEM.md §7.
 */
export type PageShellVariant = "document" | "narrow" | "workspace";

interface PageShellProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Page-level controls. One place, so surfaces stop inventing action rows. */
  actions?: React.ReactNode;
  variant?: PageShellVariant;
  /**
   * Content rendered between the header and the body — filters, tabs, a
   * segmented control. Sticks with the header in workspace surfaces.
   */
  toolbar?: React.ReactNode;
}

const CONTAINER_CLASSES: Record<PageShellVariant, string> = {
  document: "app-content",
  narrow: "app-content-narrow",
  workspace: "app-workspace-content flex flex-col",
};

export function PageShell({
  title,
  description,
  icon: Icon,
  actions,
  toolbar,
  variant = "document",
  className,
  children,
  ...props
}: PageShellProps) {
  const workspace = variant === "workspace";

  return (
    <div
      data-slot="page-shell"
      data-page-variant={variant}
      className={cn(CONTAINER_CLASSES[variant], className)}
      {...props}
    >
      <header
        data-slot="page-shell-header"
        className={cn(
          "flex min-w-0 flex-col gap-3 text-start sm:flex-row sm:items-start sm:justify-between sm:gap-6",
          workspace
            ? "shrink-0 border-b border-border/80 px-4 py-3"
            : "border-b border-border/70 pb-4",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <IconTile
              icon={Icon}
              size={workspace ? "sm" : "md"}
              className={workspace ? undefined : "mt-0.5"}
            />
          ) : null}
          <div className="min-w-0">
            {/*
              Always visible. A page whose only heading is `sr-only` reads to a
              sighted seller as a screen with no name.
            */}
            <h1
              className={cn(
                "min-w-0 text-balance text-start text-foreground",
                workspace ? "text-title-2" : "text-title-1",
              )}
            >
              {title}
            </h1>
            {description ? (
              <p
                className={cn(
                  "max-w-prose text-pretty text-start text-muted-foreground",
                  workspace ? "text-caption" : "mt-1 text-body",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div
            data-slot="page-shell-actions"
            className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          >
            {actions}
          </div>
        ) : null}
      </header>

      {toolbar ? (
        <div
          data-slot="page-shell-toolbar"
          className={cn(
            "min-w-0",
            workspace ? "shrink-0 border-b border-border/80 px-4 py-2" : "pt-4",
          )}
        >
          {toolbar}
        </div>
      ) : null}

      <div
        data-slot="page-shell-body"
        className={cn(
          "min-w-0",
          workspace ? "min-h-0 flex-1 overflow-hidden" : "page-sections pt-6",
        )}
      >
        {children}
      </div>
    </div>
  );
}
