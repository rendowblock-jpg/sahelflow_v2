import * as React from "react";

import { PageHeader } from "@/components/shared/page-header";
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
 * IA-01 — the header itself is `PageHeader`, not a second implementation of
 * one. PageShell owns the page CONTAINER (which shell class, how the body
 * scrolls); PageHeader owns page IDENTITY. Two components rendering their own
 * heading was the deeper half of the two-architectures defect.
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
      <PageHeader
        title={title}
        description={description}
        icon={Icon}
        actions={actions}
        variant={workspace ? "workspace" : "document"}
      />

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
