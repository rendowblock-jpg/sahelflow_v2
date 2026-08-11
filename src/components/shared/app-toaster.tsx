"use client";

import { Toaster } from "@/components/ui/sonner";
import { getDirection } from "@/lib/i18n";
import { useUIStore } from "@/stores/ui-store";

/**
 * Global toast viewport follows the same live locale authority as the shell.
 * Keeping its position in the server root layout left it on the stale edge during
 * an interactive LTR/RTL switch until a server refresh completed.
 */
export function AppToaster() {
  const locale = useUIStore((state) => state.locale);
  const dir = getDirection(locale);

  return (
    <Toaster
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      richColors
      closeButton
      toastOptions={{ className: "shadow-popover" }}
    />
  );
}
