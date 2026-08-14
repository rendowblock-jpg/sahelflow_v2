import type { ImgHTMLAttributes } from "react";

type SahelFlowMarkProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt"
> & {
  accessibleTitle?: string;
};

/**
 * Canonical SahelFlow product mark.
 *
 * The source bytes are the Founder-provided 512×512 PNG in
 * public/icons/sahelflow-mark.png. Application chrome and native bundle icon
 * generation both reference those exact bytes; do not redraw this mark here.
 */
export function SahelFlowMark({
  accessibleTitle,
  draggable = false,
  ...props
}: SahelFlowMarkProps) {
  return (
    <img
      src="/icons/sahelflow-mark.png"
      alt={accessibleTitle ?? ""}
      draggable={draggable}
      {...props}
    />
  );
}
