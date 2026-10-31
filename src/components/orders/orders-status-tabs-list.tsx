"use client";

import type { ComponentProps } from "react";

import { TabsList } from "@/components/ui/tabs";
import { useMobile } from "@/hooks/use-mobile";

/**
 * The Orders status tabs. On a phone they are ONE strip that scrolls sideways (a finger needs
 * 44 px per tab, four wrapped lines would push the list down the page); elsewhere they wrap
 * exactly as before. The hook's server snapshot is "not a phone", so the first paint is the
 * desktop one and no width is read while rendering.
 */
export function OrdersStatusTabsList({
  ...props
}: Omit<ComponentProps<typeof TabsList>, "wrap" | "scroll">) {
  const isPhone = useMobile();
  return <TabsList wrap={!isPhone} scroll={isPhone} {...props} />;
}
