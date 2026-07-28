import * as React from "react"

import { cn } from "@/lib/utils"

const TECHNICAL_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "time",
  "url",
  "week",
])

function Input({ className, type, dir, ...props }: React.ComponentProps<"input">) {
  const resolvedDir = dir ?? (type && TECHNICAL_INPUT_TYPES.has(type) ? "ltr" : "auto")

  return (
    <input
      type={type}
      dir={resolvedDir}
      data-slot="input"
      className={cn(
        "h-[var(--control-height)] w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
