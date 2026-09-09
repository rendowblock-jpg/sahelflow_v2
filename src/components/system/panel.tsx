import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The product surface container.
 *
 * `ui/card.tsx` is the shadcn atom and carries its own geometry
 * (`rounded-xl`, `py-6`, `gap-6`, `shadow-layer`). Panel is the system
 * container: one radius (`--radius-surface`), one padding step, a hairline
 * border and no resting shadow — elevation is reserved for transient surfaces
 * per INTERFACE_SYSTEM.md §4. Surfaces migrate from Card to Panel as they are
 * rebuilt; both exist during the transition.
 */
interface PanelProps extends React.ComponentProps<"section"> {
  /** Removes internal padding so the panel can host a table or list flush. */
  flush?: boolean;
}

export function Panel({ className, flush = false, ...props }: PanelProps) {
  return (
    <section
      data-slot="panel"
      className={cn(
        "min-w-0 rounded-surface border border-border/80 bg-card text-card-foreground",
        flush ? "overflow-hidden" : "p-4",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn(
        "flex min-w-0 items-start justify-between gap-3 pb-3",
        className,
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="panel-title"
      className={cn("min-w-0 text-title-3 text-foreground", className)}
      {...props}
    />
  );
}

export function PanelDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn("mt-1 text-body-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function PanelContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div data-slot="panel-content" className={cn("min-w-0", className)} {...props} />;
}

export function PanelFooter({
  className,
  ...props
}: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="panel-footer"
      className={cn(
        "mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3",
        className,
      )}
      {...props}
    />
  );
}
