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
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors",
                  theme === t ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Density */}
        <div className="space-y-2">
          <Label>Table density</Label>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDensity(d);
                  localStorage.setItem("sf-density", d);
                  toast.success(`Density set to ${d}`);
                }}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors",
                  density === d ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted",
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Affects all data tables across the app.</p>
        </div>
      </CardContent>
    </Card>
  );
}
