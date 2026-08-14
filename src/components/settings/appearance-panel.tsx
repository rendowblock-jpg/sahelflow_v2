"use client";

import {
  useTheme,
  type ThemePreset,
} from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { useUiDensity } from "@/hooks/use-ui-density";
import {
  DEFAULT_NAVIGATION_DOMAIN_ORDER,
  orderedNavigationDomains,
} from "@/components/layout/navigation";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useUIStore } from "@/stores/ui-store";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
} from "lucide-react";

const PRESET_PREVIEW: Record<
  ThemePreset,
  { accent: string; secondary: string; canvas: string; rail: string }
> = {
  sahel: {
    accent: "oklch(0.70 0.18 150)",
    secondary: "oklch(0.70 0.18 248)",
    canvas: "oklch(0.178 0.012 145)",
    rail: "oklch(0.235 0.030 150)",
  },
  atlas: {
    accent: "oklch(0.72 0.17 285)",
    secondary: "oklch(0.71 0.15 245)",
    canvas: "oklch(0.178 0.022 280)",
    rail: "oklch(0.245 0.055 285)",
  },
  oasis: {
    accent: "oklch(0.74 0.14 190)",
    secondary: "oklch(0.74 0.15 165)",
    canvas: "oklch(0.178 0.022 190)",
    rail: "oklch(0.245 0.050 190)",
  },
  dune: {
    accent: "oklch(0.78 0.14 70)",
    secondary: "oklch(0.73 0.17 28)",
    canvas: "oklch(0.178 0.023 65)",
    rail: "oklch(0.245 0.058 65)",
  },
};

function PresetPreview({ candidate }: { candidate: ThemePreset }) {
  const swatch = PRESET_PREVIEW[candidate];
  return (
    <span
      aria-hidden="true"
      className="relative block h-14 w-full overflow-hidden rounded-lg border border-white/10 shadow-inner"
      style={{ background: swatch.canvas }}
    >
      <span
        className="absolute inset-y-0 start-0 w-3"
        style={{ background: swatch.rail }}
      />
      <span className="absolute inset-x-5 top-3 flex items-center gap-1.5">
        <span
          className="h-1.5 w-10 rounded-full"
          style={{ background: swatch.accent }}
        />
        <span className="h-1.5 w-5 rounded-full bg-white/16" />
      </span>
      <span className="absolute inset-x-5 bottom-3 grid grid-cols-3 gap-1.5">
        <span className="h-4 rounded bg-white/7" />
        <span
          className="h-4 rounded"
          style={{ background: `color-mix(in oklch, ${swatch.secondary} 28%, transparent)` }}
        />
        <span
          className="h-4 rounded"
          style={{ background: `color-mix(in oklch, ${swatch.accent} 24%, transparent)` }}
        />
      </span>
    </span>
  );
}

export function AppearancePanel() {
  const { t } = useI18n();
  const { theme, setTheme, preset, setPreset, presets } = useTheme();
  const { density, setDensity } = useUiDensity();
  const navigationDomainOrder = useUIStore(
    (state) => state.navigationDomainOrder,
  );
  const setNavigationDomainOrder = useUIStore(
    (state) => state.setNavigationDomainOrder,
  );
  const resetNavigationDomainOrder = useUIStore(
    (state) => state.resetNavigationDomainOrder,
  );
  const orderedDomains = orderedNavigationDomains(navigationDomainOrder);

  const themeModes = [
    { id: "light" as const, label: t("theme.light"), icon: Sun },
    { id: "dark" as const, label: t("theme.dark"), icon: Moon },
    { id: "system" as const, label: t("theme.system"), icon: Monitor },
  ];

  const moveNavigationDomain = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= orderedDomains.length) return;
    const ids = orderedDomains.map((domain) => domain.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setNavigationDomainOrder(ids);
  };

  const navigationIsDefault = orderedDomains.every(
    (domain, index) => domain.id === DEFAULT_NAVIGATION_DOMAIN_ORDER[index],
  );

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
                    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
                    selected
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-sm"
                      : "bg-background text-muted-foreground hover:-translate-y-px hover:bg-muted/60 hover:text-foreground",
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
                    "group overflow-hidden rounded-xl border p-2 text-start text-sm font-medium",
                    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
                    selected
                      ? "border-primary/55 bg-primary/[0.07] text-foreground shadow-sm"
                      : "bg-background text-muted-foreground hover:-translate-y-px hover:border-border hover:bg-muted/35 hover:text-foreground",
                  )}
                >
                  <PresetPreview candidate={candidate} />
                  <span className="mt-2 flex min-w-0 items-center gap-2 px-1 pb-0.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: PRESET_PREVIEW[candidate].accent }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {t(`settings.appearance.preset.${candidate}`)}
                    </span>
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : null}
                  </span>
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

        <section className="space-y-3" data-navigation-preferences="true">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <Label>{t("settings.appearance.navigationTitle")}</Label>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("settings.appearance.navigationHint")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetNavigationDomainOrder}
              disabled={navigationIsDefault}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {t("settings.appearance.navigationReset")}
            </Button>
          </div>

          <ol className="grid gap-2 sm:grid-cols-2">
            {orderedDomains.map((domain, index) => {
              const Icon = domain.icon;
              const label = t(domain.labelKey);
              return (
                <li
                  key={domain.id}
                  className="flex min-h-12 items-center gap-3 rounded-xl border bg-background px-3 py-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {label}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveNavigationDomain(index, -1)}
                      disabled={index === 0}
                      aria-label={t("settings.appearance.navigationMoveUp", {
                        name: label,
                      })}
                    >
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveNavigationDomain(index, 1)}
                      disabled={index === orderedDomains.length - 1}
                      aria-label={t("settings.appearance.navigationMoveDown", {
                        name: label,
                      })}
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </CardContent>
    </Card>
  );
}
