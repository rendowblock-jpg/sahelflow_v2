"use client";

import { useTheme } from "@/components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useUIStore } from "@/stores/ui-store";

export function AppearancePanel() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const density = useUIStore((state) => state.density);
  const setDensity = useUIStore((state) => state.setDensity);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme */}
        <div className="space-y-2">
          <Label>{t("settings.appearance.theme")}</Label>
          <div className="flex flex-wrap gap-2">
            {(["light", "dark", "system"] as const).map((mode) => {
              const themeLabel =
                mode === "light"
                  ? t("theme.light")
                  : mode === "dark"
                    ? t("theme.dark")
                    : t("theme.system");
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  aria-pressed={theme === mode}
                  className={cn(
                    "min-h-10 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                    theme === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-background hover:bg-muted",
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
          <div className="flex flex-wrap gap-2">
            {(["comfortable", "compact"] as const).map((candidate) => {
              const densityLabel =
                candidate === "comfortable"
                  ? t("settings.appearance.comfortable")
                  : t("settings.appearance.compact");
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => {
                    setDensity(candidate);
                    toast.success(densityLabel);
                  }}
                  aria-pressed={density === candidate}
                  className={cn(
                    "min-h-10 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                    density === candidate
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {densityLabel}
                </button>
              );
            })}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("settings.appearance.densityHint")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
