import Image from "next/image";
import type { ComponentProps } from "react";

type SahelFlowMarkProps = Omit<
  ComponentProps<typeof Image>,
  "src" | "alt" | "width" | "height"
> & {
  accessibleTitle?: string;
};

/**
 * Canonical SahelFlow product mark.
 *
 * The source bytes are the Founder-approved 512×512 PNG in
 * public/icons/sahelflow-mark.png, rendered from the vector master in
 * public/brand/sahelflow-logo.svg (F-28, "Deep Ocean"). Application chrome and native bundle icon
 * generation both reference those exact bytes; do not redraw this mark here.
 */
export function SahelFlowMark({
  accessibleTitle,
  draggable = false,
  ...props
}: SahelFlowMarkProps) {
  return (
    <Image
      src="/icons/sahelflow-mark.png"
      alt={accessibleTitle ?? ""}
      width={512}
      height={512}
      draggable={draggable}
      {...props}
    />
  );
}
