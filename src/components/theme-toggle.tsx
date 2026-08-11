"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

/**
 * Subscribe to the mounted client snapshot without triggering a synchronous
 * setState inside an effect.
 *
 * useSyncExternalStore gives us a server snapshot (false = "not mounted yet")
 * and a client snapshot (true = "mounted") — the standard SSR-safe pattern
 * for "is this client-rendered yet?" checks.
 */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsMounted();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
