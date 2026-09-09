/**
 * SahelFlow design system — the primitive layer.
 *
 * Between the shadcn atoms in `components/ui` and the page components there was
 * nothing, so pages ran to 2,235 lines and re-derived the same ideas from raw
 * Tailwind. This namespace is that missing middle, and it is the only place a
 * shared interface concept is allowed to be defined.
 *
 * Authority: `documentation/product/INTERFACE_SYSTEM.md`.
 * Register:  `documentation/operations/TRANSFORMATION_REGISTER.md` (SYS-07).
 *
 * One authority per concept. A second implementation of anything exported here
 * is a defect, not a variant.
 */

export { PageShell, type PageShellVariant } from "@/components/system/page-shell";
export { Section, SectionStack } from "@/components/system/section";
export {
  Panel,
  PanelContent,
  PanelDescription,
  PanelFooter,
  PanelHeader,
  PanelTitle,
} from "@/components/system/panel";
export { Row, RowGroup, type RowTone } from "@/components/system/row";
export { Field, type FieldControlProps } from "@/components/system/field";
export { IconTile, type IconTileSize, type IconTileTone } from "@/components/system/icon-tile";
export { Toolbar, ToolbarGroup, ToolbarSpacer } from "@/components/system/toolbar";

/**
 * The canonical empty / loading / failure surface.
 *
 * Four competing primitives existed — `state-surface` (19 uses),
 * `empty-states` (11 hardcoded per-domain copies), `empty-state` (2 uses) and
 * `operational-state` (0 uses, dead). `StateSurface` was the best-built of the
 * four (tone, size, actions, details, live-region), so it is promoted here as
 * the authority rather than replaced by a fifth implementation. It keeps its
 * current path while its 19 call sites are untouched; the duplicates retire as
 * their surfaces are rebuilt (register UI-07).
 */
export {
  StateSurface,
  type StateSurfaceSize,
  type StateSurfaceTone,
} from "@/components/shared/state-surface";
