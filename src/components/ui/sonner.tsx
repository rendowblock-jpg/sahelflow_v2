"use client"

import { useTheme } from "@/components/theme-provider"
import { getDirection } from "@/lib/i18n"
import { useUIStore } from "@/stores/ui-store"
import { Toaster as Sonner } from "sonner"
import type { ToasterProps } from "sonner"

const Toaster = ({ position, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const locale = useUIStore((state) => state.locale)
  const direction = getDirection(locale)
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
