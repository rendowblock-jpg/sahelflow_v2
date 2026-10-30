"use client";

import * as React from "react";

interface StateHeadingProps {
  /** Banners use a paragraph so they do not pollute the page outline. */
  as?: "h2" | "p";
  /** Move keyboard and screen-reader focus here when the state appears. */
  autoFocus?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * The only client piece of StateSurface, so the surface itself stays usable
 * from server components. An error replaces the page content: focusing its
 * heading tells a screen-reader user what happened and where they are.
 */
export function StateHeading({
  as = "h2",
  autoFocus = false,
  className,
  children,
}: StateHeadingProps) {
  const ref = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  if (as === "p") return <p className={className}>{children}</p>;
  return (
    <h2
      ref={ref}
      tabIndex={autoFocus ? -1 : undefined}
      className={autoFocus ? `${className ?? ""} outline-none` : className}
    >
      {children}
    </h2>
  );
}
