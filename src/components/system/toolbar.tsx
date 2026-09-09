import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A control row that cannot clip.
 *
 * The installed-campaign findings F-08 and F-11 were both the same defect: a
 * single non-wrapping flex row whose only shrinkable child collapsed to zero
 * width under Arabic labels, so the delete control collided with its
 * neighbours at ~430px. Toolbar wraps by construction and keeps its groups
 * intact, so that failure mode is not reachable from the primitive.
 *
 * INTERFACE_SYSTEM.md §6, §8.
 */
export function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A group of related controls inside a Toolbar. Groups wrap as a unit, so a
 * label never separates from the control it belongs to.
 */
export function ToolbarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar-group"
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

/** Pushes everything after it to the end of the row (logical, RTL-safe). */
export function ToolbarSpacer() {
  return <div data-slot="toolbar-spacer" className="flex-1" aria-hidden="true" />;
}
