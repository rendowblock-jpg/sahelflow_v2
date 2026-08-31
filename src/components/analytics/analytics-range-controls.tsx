"use client";

/**
 * Analytics range control (R4-d): preset chips (7/30/90 days) + a custom
 * start/end date pair, all URL-persisted via nuqs so a range is shareable,
 * survives reload and works with back/forward — the same contract as the
 * R2-a orders filter bar.
 */

import { useState } from "react";
import { CalendarRange } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  ANALYTICS_RANGE_PRESETS,
  type AnalyticsRangePresetKey,
} from "@/lib/analytics/range";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAnalyticsRangeParams } from "./use-analytics-range-params";

const PRESET_LABEL_KEYS: Record<AnalyticsRangePresetKey, string> = {
  "7d": "analytics.last7Days",
  "30d": "analytics.last30Days",
  "90d": "analytics.last90Days",
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function AnalyticsRangeControls() {
  const { t } = useI18n();
  const { range, from, to, selectPreset, applyCustomRange } =
    useAnalyticsRangeParams();
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");
  const [showCustomFields, setShowCustomFields] = useState(
    range === "custom" && Boolean(from && to),
  );
  const [invalid, setInvalid] = useState(false);

  const customActive = range === "custom" && Boolean(from && to);

  function handlePreset(preset: AnalyticsRangePresetKey) {
    setShowCustomFields(false);
    setInvalid(false);
    selectPreset(preset);
  }

  function handleCustomToggle() {
    if (!showCustomFields) {
      setShowCustomFields(true);
      setInvalid(false);
      return;
    }
    setShowCustomFields(false);
  }

  function handleApply() {
    const valid =
      ISO_DATE_PATTERN.test(customFrom) &&
      ISO_DATE_PATTERN.test(customTo) &&
      customFrom <= customTo;
    setInvalid(!valid);
    if (valid) applyCustomRange(customFrom, customTo);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="flex items-center rounded-lg border bg-muted/40 p-0.5"
        role="group"
        aria-label={t("orders.filters.dateRange")}
      >
        {ANALYTICS_RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => handlePreset(preset)}
            aria-pressed={range === preset}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              range === preset && !customActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(PRESET_LABEL_KEYS[preset])}
          </button>
        ))}
        <button
          type="button"
          onClick={handleCustomToggle}
          aria-pressed={customActive}
          aria-expanded={showCustomFields}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            customActive
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarRange className="size-3.5" aria-hidden="true" />
          {t("orders.filters.dateCustom")}
        </button>
      </div>

      {showCustomFields ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
            aria-label={t("orders.filters.from")}
            className="h-8 w-[9.5rem] text-xs"
          />
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            –
          </span>
          <Input
            type="date"
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
            aria-label={t("orders.filters.to")}
            className="h-8 w-[9.5rem] text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleApply}
            className="h-8 px-3 text-xs"
          >
            {t("analytics.range.apply")}
          </Button>
        </div>
      ) : null}

      {invalid ? (
        <p className="text-xs text-destructive" role="alert">
          {t("analytics.range.invalid")}
        </p>
      ) : null}

      {customActive ? (
        <p className="text-xs text-muted-foreground" dir="ltr">
          {t("analytics.range.windowLabel", {
            from: from ?? "",
            to: to ?? "",
          })}
        </p>
      ) : null}
    </div>
  );
}
