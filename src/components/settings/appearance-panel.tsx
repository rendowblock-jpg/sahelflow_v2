"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/use-i18n";

export function AppearancePanel() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useState<"comfortable" | "compact">(
    typeof window !== "undefined" ? (localStorage.getItem("sf-density") as "comfortable" | "compact") ?? "comfortable" : "comfortable"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme */}
        <div className="space-y-2">
          <Label>{t("settings.appearance.theme")}</Label>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((mode) => {
              const themeLabel =
                mode === "light" ? t("theme.light")
                : mode === "dark" ? t("theme.dark")
                : t("theme.system");
              return (
                <button
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                    theme === mode ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted",
                  )}
                >
                  {themeLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Density */}
        <div className="space-y-2">
          <Label>{t("settings.appearance.tableDensity")}</Label>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as const).map((d) => {
              const densityLabel =
                d === "comfortable" ? t("settings.appearance.comfortable") : t("settings.appearance.compact");
              return (
                <button
                  key={d}
                  onClick={() => {
                    setDensity(d);
                    localStorage.setItem("sf-density", d);
                    toast.success(densityLabel);
                  }}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                    density === d ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted",
                  )}
                >
                  {densityLabel}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.appearance.densityHint")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
