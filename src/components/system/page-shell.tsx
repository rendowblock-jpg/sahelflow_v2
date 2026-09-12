import * as React from "react";

import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";

/**
 * The single page grammar.
 *
 * PageShell owns the page CONTAINER (which shell class, how the body
 * scrolls); PageHeader owns page IDENTITY when the route does not already
 * carry a surface header. Full-height workspaces (Inbox, Agents) still use
 * this primitive so `app-workspace-content` stays on the route root for the
 * `#main-content:has(> …)` rule — they do not invent a second visible title
 * band on top of their own chrome.
 *
 * Founder-installed Internal.37 rejected the visible workspace PageHeader:
 * Inbox and Agents already name themselves inside the canvas, and the extra
 * band stole vertical space from the work. `identity="sr-only"` keeps the
 * localized `<h1>` for assistive tech without consuming pane pixels.
 *
 * The shell classes (`app-content`, `app-content-narrow`,
 * `app-workspace-content`) remain the layout authority from
 * `phase5.css` / `experience-system.css`.
 *
 * INTERFACE_SYSTEM.md §7.
 */
export type PageShellVariant = "document" | "narrow" | "workspace";
export type PageShellIdentity = "visible" | "sr-only";

interface PageShellProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Page-level controls. One place, so surfaces stop inventing action rows. */
  actions?: React.ReactNode;
  variant?: PageShellVariant;
  /**
   * `sr-only` is for workspaces whose canvas already carries visible identity
   * (Inbox, Agents). Document routes stay `visible`.
   */
  identity?: PageShellIdentity;
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
  identity = "visible",
  className,
  children,
  ...props
}: PageShellProps) {
  const workspace = variant === "workspace";
  const hiddenIdentity = identity === "sr-only";

  return (
    <div
      data-slot="page-shell"
      data-page-variant={variant}
      data-page-identity={identity}
      className={cn(CONTAINER_CLASSES[variant], className)}
      {...props}
    >
      {hiddenIdentity ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <PageHeader
          title={title}
          description={description}
          icon={Icon}
          actions={actions}
          variant={workspace ? "workspace" : "document"}
        />
      )}

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
