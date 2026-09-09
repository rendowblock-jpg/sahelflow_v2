import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A titled region inside a work surface.
 *
 * Section owns the vertical rhythm between a heading, its explanation and its
 * content (INTERFACE_SYSTEM.md §5) so that spacing stops being re-decided per
 * page. Headings render at `--text-title-2`, which is the level the audit found
 * missing everywhere: 1,200 of 1,291 type-size usages were xs/sm/2xs, so
 * sections previously announced themselves in the same voice as their own
 * metadata.
 */
interface SectionProps extends React.ComponentProps<"section"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Controls aligned to the end of the heading row. */
  actions?: React.ReactNode;
  /**
   * Heading level. Sections nest inside a page whose `<h1>` is the page title,
   * so the default is `h2` and deeper nesting passes `h3`.
   */
  as?: "h2" | "h3";
}

export function Section({
  title,
  description,
  actions,
  as: Heading = "h2",
  className,
  children,
  ...props
}: SectionProps) {
  const headingId = React.useId();
  return (
    <section
      data-slot="section"
      aria-labelledby={title ? headingId : undefined}
      className={cn("min-w-0", className)}
      {...props}
    >
      {title || actions ? (
        <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <Heading
                id={headingId}
                className="min-w-0 text-title-2 text-foreground"
              >
                {title}
              </Heading>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-prose text-body-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Stacks sections at the system's section rhythm. */
export function SectionStack({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="section-stack"
      className={cn("min-w-0 space-y-6", className)}
      {...props}
    />
  );
}
