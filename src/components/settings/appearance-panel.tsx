"use client";

import {
  useTheme,
  type ThemePreset,
} from "@/components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useUIStore } from "@/stores/ui-store";
import { Check, Monitor, Moon, Sun } from "lucide-react";

const PRESET_SWATCH: Record<ThemePreset, string> = {
  sahel: "bg-emerald-500",
  atlas: "bg-violet-500",
  oasis: "bg-cyan-500",
  dune: "bg-amber-500",
};

export function AppearancePanel() {
  const { t } = useI18n();
  const { theme, setTheme, preset, setPreset, presets } = useTheme();
  const density = useUIStore((state) => state.density);
  const setDensity = useUIStore((state) => state.setDensity);

  const themeModes = [
    { id: "light" as const, label: t("theme.light"), icon: Sun },
    { id: "dark" as const, label: t("theme.dark"), icon: Moon },
    { id: "system" as const, label: t("theme.system"), icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-7">
        <section className="space-y-3">
          <Label>{t("settings.appearance.theme")}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {themeModes.map(({ id, label, icon: Icon }) => {
              const selected = theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  aria-pressed={selected}
                  data-theme-mode={id}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-medium",
                    "transition-[background-color,border-color,color,box-shadow] duration-150",
                    selected
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card",
                      selected && "border-primary/30 text-primary",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {selected ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <Label>{t("settings.appearance.colorStyle")}</Label>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("settings.appearance.colorStyleHint")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {presets.map((candidate) => {
              const selected = preset === candidate;
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setPreset(candidate)}
                  aria-pressed={selected}
                  data-theme-preset-option={candidate}
                  className={cn(
                    "group flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-medium",
                    "transition-[background-color,border-color,color,box-shadow] duration-150",
                    selected
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-5 shrink-0 rounded-full ring-2 ring-background ring-offset-1 ring-offset-border",
                      PRESET_SWATCH[candidate],
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`settings.appearance.preset.${candidate}`)}
                  </span>
                  {selected ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <Label>{t("settings.appearance.density")}</Label>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("settings.appearance.densityHintGlobal")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["comfortable", "compact"] as const).map((candidate) => {
              const densityLabel =
                candidate === "comfortable"
                  ? t("settings.appearance.comfortable")
                  : t("settings.appearance.compact");
              const selected = density === candidate;
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => {
                    setDensity(candidate);
                    toast.success(densityLabel);
                  }}
                  aria-pressed={selected}
                  data-density-option={candidate}
                  className={cn(
                    "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-medium",
                    "transition-[background-color,border-color,color,box-shadow] duration-150",
                    selected
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span>{densityLabel}</span>
                  {selected ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
