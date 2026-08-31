"use client";

/**
 * OrdersFilterBar — scoped search + filters for the operational orders list.
 *
 * Every filter lives in the URL (nuqs, shallow routing): shareable links,
 * working back/forward and reload survival. The bar composes:
 *   - free-text search (order number / customer / phone / wilaya)
 *   - wilaya select (localized, fed by the shared wilayas.json source)
 *   - date presets (today / 7d / 30d) plus explicit from/to day inputs
 *   - active-filter chips with individual removal and "clear all"
 * Changing any scope resets `page` to 1. Logical CSS utilities only (RTL-safe).
 */

import { useMemo } from "react";
import { X } from "lucide-react";

import { ListSearchInput } from "@/components/shared/list-search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import { useOrdersFilterParams } from "@/hooks/use-orders-filter-params";
import wilayasData from "../../../data/wilayas.json";

interface Wilaya {
  code: number;
  name: string;
  nameAr: string;
  zone: string;
}

const WILAYAS = wilayasData as Wilaya[];

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Rolling preset ranges in local days, inclusive of today. */
function presetRange(
  preset: Exclude<DatePreset, "all" | "custom">,
): { from: string; to: string } {
  const now = new Date();
  const to = localDateString(now);
  if (preset === "today") return { from: to, to };
  const start = new Date(now);
  start.setDate(start.getDate() - (preset === "7d" ? 6 : 29));
  return { from: localDateString(start), to };
}

export function OrdersFilterBar() {
  const { t, locale } = useI18n();
  const {
    q,
    wilaya,
    from,
    to,
    hasActiveFilters,
    setParams: setFilters,
    clearFilters,
  } = useOrdersFilterParams();

  const activePreset: DatePreset = useMemo(() => {
    if (!from && !to) return "all";
    const today = presetRange("today");
    if (from === today.from && to === today.to) return "today";
    const week = presetRange("7d");
    if (from === week.from && to === week.to) return "7d";
    const month = presetRange("30d");
    if (from === month.from && to === month.to) return "30d";
    return "custom";
  }, [from, to]);

  function handlePreset(value: string) {
    if (value === "all") {
      void setFilters({ from: null, to: null, page: 1 });
      return;
    }
    if (value === "custom") return;
    const range = presetRange(value as "today" | "7d" | "30d");
    void setFilters({ from: range.from, to: range.to, page: 1 });
  }

  return (
    <div
      className="flex flex-col gap-2"
      data-active-filters={hasActiveFilters ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ListSearchInput
          className="min-w-0 flex-1 basis-52"
          placeholder={t("orders.filters.searchPlaceholder")}
        />
        <Select
          value={wilaya ?? "all"}
          onValueChange={(value) =>
            void setFilters({
              wilaya: value === "all" ? null : value,
              page: 1,
            })
          }
        >
          <SelectTrigger
            className="w-fit min-w-40"
            aria-label={t("orders.wilaya")}
          >
            <SelectValue placeholder={t("orders.filters.wilayaAll")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">
              {t("orders.filters.wilayaAll")}
            </SelectItem>
            {WILAYAS.map((entry) => (
              <SelectItem key={entry.code} value={String(entry.code)}>
                {entry.code.toString().padStart(2, "0")} —{" "}
                {locale === "ar"
                  ? entry.nameAr || entry.name
                  : entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activePreset} onValueChange={handlePreset}>
          <SelectTrigger
            className="w-fit min-w-36"
            aria-label={t("orders.filters.dateRange")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("orders.filters.dateAll")}</SelectItem>
            <SelectItem value="today">
              {t("orders.filters.dateToday")}
            </SelectItem>
            <SelectItem value="7d">{t("orders.filters.date7d")}</SelectItem>
            <SelectItem value="30d">{t("orders.filters.date30d")}</SelectItem>
            <SelectItem value="custom" disabled>
              {t("orders.filters.dateCustom")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={from ?? ""}
          onChange={(event) =>
            void setFilters({
              from: event.target.value || null,
              to,
              page: 1,
            })
          }
          aria-label={t("orders.filters.from")}
          className="w-[9.5rem]"
        />
        <Input
          type="date"
          value={to ?? ""}
          onChange={(event) =>
            void setFilters({
              from,
              to: event.target.value || null,
              page: 1,
            })
          }
          aria-label={t("orders.filters.to")}
          className="w-[9.5rem]"
        />
      </div>

      {hasActiveFilters ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t("orders.filters.active")}
        >
          {q ? (
            <FilterChip
              label={t("common.search")}
              value={q}
              onRemove={() => void setFilters({ q: null, page: 1 })}
              removeLabel={t("orders.filters.removeFilter", {
                name: t("common.search"),
              })}
            />
          ) : null}
          {wilaya ? (
            <FilterChip
              label={t("orders.wilaya")}
              value={
                locale === "ar"
                  ? (
                      WILAYAS.find((entry) => String(entry.code) === wilaya)
                        ?.nameAr ?? wilaya
                    )
                  : (WILAYAS.find((entry) => String(entry.code) === wilaya)
                      ?.name ?? wilaya)
              }
              onRemove={() => void setFilters({ wilaya: null, page: 1 })}
              removeLabel={t("orders.filters.removeFilter", {
                name: t("orders.wilaya"),
              })}
            />
          ) : null}
          {from ? (
            <FilterChip
              label={t("orders.filters.from")}
              value={from}
              technical
              onRemove={() => void setFilters({ from: null, page: 1 })}
              removeLabel={t("orders.filters.removeFilter", {
                name: t("orders.filters.from"),
              })}
            />
          ) : null}
          {to ? (
            <FilterChip
              label={t("orders.filters.to")}
              value={to}
              technical
              onRemove={() => void setFilters({ to: null, page: 1 })}
              removeLabel={t("orders.filters.removeFilter", {
                name: t("orders.filters.to"),
              })}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="size-3.5" aria-hidden="true" />
            {t("orders.filters.clearAll")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  value: string;
  onRemove: () => void;
  removeLabel: string;
  /** Technical values (dates) stay LTR-isolated inside RTL copy. */
  technical?: boolean;
}

function FilterChip({
  label,
  value,
  onRemove,
  removeLabel,
  technical = false,
}: FilterChipProps) {
  return (
    <Badge
      variant="secondary"
      className="max-w-full gap-1 py-1 ps-2 pe-1 text-xs font-normal"
    >
      <span className="text-muted-foreground">{label}:</span>{" "}
      {technical ? (
        <bdi dir="ltr" className="truncate font-mono">
          {value}
        </bdi>
      ) : (
        <bdi className="truncate">{value}</bdi>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="ms-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={removeLabel}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </Badge>
  );
}
