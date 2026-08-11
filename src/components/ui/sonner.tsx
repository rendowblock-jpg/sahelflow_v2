"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "@/components/theme-provider"
import { getDirection } from "@/lib/i18n"
import { useUIStore } from "@/stores/ui-store"
import { Toaster as Sonner } from "sonner"
import type { ToasterProps } from "sonner"

type SahelToasterProps = ToasterProps & {
  /** Server-rendered direction used until the client locale store is hydrated. */
  initialDirection?: "ltr" | "rtl"
}

function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

const Toaster = ({
  position,
  initialDirection = "ltr",
  ...props
}: SahelToasterProps) => {
  const { theme = "system" } = useTheme()
  const locale = useUIStore((state) => state.locale)
  const mounted = useIsMounted()
  const direction = mounted ? getDirection(locale) : initialDirection
  const resolvedPosition =
    position ?? (direction === "rtl" ? "bottom-left" : "bottom-right")

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={resolvedPosition}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
