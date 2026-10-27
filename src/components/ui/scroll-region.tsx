import * as React from "react"

import { cn } from "@/lib/utils"

type ScrollRegionProps = Omit<
  React.ComponentProps<"div">,
  "role" | "tabIndex" | "aria-label" | "aria-labelledby"
> & {
  /** Accessible name; reuse the heading text of the content it wraps. */
  label: string
}

/**
 * A sideways-scrolling wrapper that a keyboard user can reach: it takes focus
 * (tabIndex 0), so the arrow keys scroll it, and it is a named region so a
 * screen reader says what it holds. A scroller with no focusable child is
 * otherwise out of reach (WCAG 2.1.1). The global *:focus-visible rule draws
 * the focus ring.
 */
function ScrollRegion({ label, className, ...props }: ScrollRegionProps) {
  return (
    <div
      data-slot="scroll-region"
      role="region"
      tabIndex={0}
      aria-label={label}
      className={cn("overflow-x-auto", className)}
      {...props}
    />
  )
}

export { ScrollRegion }
