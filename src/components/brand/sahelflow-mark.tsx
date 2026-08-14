import type { SVGProps } from "react";

type SahelFlowMarkProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  accessibleTitle?: string;
};

/**
 * Canonical SahelFlow product mark.
 *
 * Geometry and colors are taken from the Founder-approved 512×512 source mark.
 * Keep this component and public/icons/icon.svg visually identical so application
 * chrome, web metadata and generated desktop bundle icons share one identity.
 */
export function SahelFlowMark({
  accessibleTitle,
  ...props
}: SahelFlowMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      role={accessibleTitle ? "img" : undefined}
      aria-hidden={accessibleTitle ? undefined : true}
      {...props}
    >
      {accessibleTitle ? <title>{accessibleTitle}</title> : null}
      <rect width="512" height="512" fill="#101728" />
      <g fill="#F2EEE4">
        <rect x="108" y="140" width="243" height="33" />
        <rect x="363" y="140" width="41" height="33" />
        <rect x="108" y="206" width="192" height="33" />
        <rect x="312" y="206" width="92" height="33" />
        <rect x="108" y="272" width="142" height="33" />
        <rect x="262" y="272" width="142" height="33" />
        <rect x="108" y="338" width="92" height="33" />
        <rect x="212" y="338" width="158" height="33" />
      </g>
      <rect x="370" y="337" width="35" height="35" fill="#39D4BF" />
    </svg>
  );
}
