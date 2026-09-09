import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The settings/preferences row grammar.
 *
 * Today each of the 11 settings panels invents its own label/description/control
 * geometry inside its own `<Card>`, which is why the surface reads as assembled
 * by different hands. `RowGroup` + `Row` are the single grammar: identity on the
 * start side, control on the end side, hairline separated, stacking on narrow
 * viewports. Direction comes from logical properties, so RTL is correct by
 * construction rather than by per-panel care.
 *
 * INTERFACE_SYSTEM.md §6.
 */

export function RowGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-group"
      className={cn(
        "min-w-0 divide-y divide-border/70 rounded-surface border border-border/80 bg-card",
        className,
      )}
      {...props}
    />
  );
}

export type RowTone = "default" | "danger";

interface RowProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** Row identity. Rendered as the accessible label when `controlId` is set. */
  label: React.ReactNode;
  /** Supporting explanation. Kept to one or two lines. */
  description?: React.ReactNode;
  /** The control this row exists to expose. */
  control?: React.ReactNode;
  /**
   * Id of the single form control the label belongs to. When provided the label
   * renders as a real `<label for>`, so clicking it focuses the control.
   */
  controlId?: string;
  tone?: RowTone;
  /** Extra content below the label/control pair (errors, live status, help). */
  children?: React.ReactNode;
}

export function Row({
  label,
  description,
  control,
  controlId,
  tone = "default",
  className,
  children,
  ...props
}: RowProps) {
  const descriptionId = controlId ? `${controlId}-description` : undefined;
  const LabelTag = controlId ? "label" : "div";

  return (
    <div
      data-slot="row"
      data-tone={tone}
      className={cn(
        "flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        <LabelTag
          {...(controlId ? { htmlFor: controlId } : {})}
          className={cn(
            "block text-title-3",
            tone === "danger" ? "text-destructive" : "text-foreground",
            controlId && "cursor-pointer",
          )}
        >
          {label}
        </LabelTag>
        {description ? (
          <p
            id={descriptionId}
            className="max-w-prose text-body-sm text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
        {children}
      </div>

      {control ? (
        <div
          data-slot="row-control"
          className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
        >
          {control}
        </div>
      ) : null}
    </div>
  );
}
