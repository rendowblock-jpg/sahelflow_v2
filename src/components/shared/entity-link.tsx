import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EntityLinkProps extends Omit<ComponentProps<typeof Link>, "children"> {
  children: ReactNode;
  secondary?: ReactNode;
  mono?: boolean;
}

/**
 * Shared contextual entity navigation. Lists keep a real labelled link in the
 * semantic table row so keyboard and assistive-technology users never depend on
 * pointer-only row activation.
 */
export function EntityLink({
  children,
  secondary,
  mono = false,
  className,
  ...props
}: EntityLinkProps) {
  return (
    <Link
      {...props}
      className={cn(
        "inline-flex min-w-0 flex-col rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        mono && "font-mono",
        className,
      )}
      data-entity-link
    >
      <span className="truncate">{children}</span>
      {secondary ? (
        <span className="truncate text-xs font-normal text-muted-foreground">
          {secondary}
        </span>
      ) : null}
    </Link>
  );
}
