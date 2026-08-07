"use client";
import * as React from "react";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

interface DirectionalIconProps extends React.SVGProps<SVGSVGElement> {
  icon: React.ElementType;
}

/**
 * Phase 6 (RTL Parity): Automatically flips directional icons when dir="rtl".
 * Use this for ArrowLeft/Right, ChevronLeft/Right, Send, Undo/Redo.
 * Do NOT use this for symmetric or semantic icons (Check, X, Info, Package).
 */
export function DirectionalIcon({ icon: Icon, className, ...props }: DirectionalIconProps) {
  const { dir } = useI18n();
  return (
    <Icon
      className={cn("size-4 shrink-0", dir === "rtl" && "-scale-x-100", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
