import * as React from "react";

import { cn } from "@/lib/utils";

export type TechnicalValueProps = Omit<
  React.ComponentProps<"bdi">,
  "dir"
>;

/**
 * Isolate seller-facing technical identifiers from the surrounding language.
 *
 * Order numbers, tracking references, SKUs, phone numbers and similar identifiers
 * are structurally LTR data even when the surrounding product copy is Arabic.
 * `bdi` keeps that value from leaking direction into neighboring RTL text without
 * changing the direction of the surrounding table, dialog or sentence.
 */
export function TechnicalValue({
  className,
  children,
  ...props
}: TechnicalValueProps) {
  return (
    <bdi
      dir="ltr"
      data-technical-value="true"
      className={cn("technical-value font-mono", className)}
      {...props}
    >
      {children}
    </bdi>
  );
}
