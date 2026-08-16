"use client";

import type { ReactNode } from "react";
import { Direction } from "radix-ui";

import { useI18n } from "@/hooks/use-i18n";

interface AppDirectionProviderProps {
  children: ReactNode;
}

/**
 * One reactive reading-direction authority for every Radix primitive.
 *
 * SahelFlow renders many menus, popovers, scroll areas, dialogs and tooltips
 * through Radix portals. A DOM `dir` attribute on the dashboard shell is not
 * enough for those primitives: portal geometry and primitive-internal ordering
 * consume Radix's own direction context. Keep that context bound to the same
 * client locale transaction that moves translated copy and shell geometry so an
 * Arabic switch cannot leave primitive internals behaving as LTR.
 */
export function AppDirectionProvider({ children }: AppDirectionProviderProps) {
  const { dir } = useI18n();

  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}
