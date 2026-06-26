"use client";

/**
 * WilayaCommuneSelect — shared localized wilaya + commune dropdown pair.
 *
 * Why this exists:
 * - Replaces inconsistent inline implementations (some used plain <Input>,
 *   some used <Select> with English-only names).
 * - Always renders the localized name (Arabic / French / English) based on
 *   the active locale.
 * - Single source of truth — used by order form, customer form, storefront,
 *   and anywhere else wilaya/commune selection is needed.
 *
 * Pattern: shadcn v4 Select + lazy commune fetch from /api/communes?wilaya=X
 * (keeps the 197KB communes.json out of the client bundle — T-019).
 */

import { useEffect, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import wilayasData from "../../../data/wilayas.json";

interface Wilaya {
  code: number;
  name: string;
  nameAr: string;
  zone: string;
}

interface Commune {
  code: number;
  wilayaCode: number;
  name: string;
  nameAr: string;
  postCode?: string;
}

interface WilayaCommuneSelectProps {
  /** Current wilaya value (English name — what's stored in the DB) */
  wilaya: string;
  /** Current commune value (English name — what's stored in the DB) */
  commune: string;
  /** Called when wilaya changes. Commune is reset to "" automatically. */
  onWilayaChange: (wilaya: string) => void;
  /** Called when commune changes. */
  onCommuneChange: (commune: string) => void;
  /** Layout: "grid" (2-col side-by-side) or "stack" (vertical). Default: grid */
  layout?: "grid" | "stack";
  /** Show labels above the dropdowns. Default: true */
  showLabels?: boolean;
  /** Wilaya label override (defaults to i18n key `orders.wilaya`) */
  wilayaLabel?: string;
  /** Commune label override (defaults to i18n key `orders.commune`) */
  communeLabel?: string;
  /** Disable both dropdowns */
  disabled?: boolean;
  /** Required field markers */
  required?: boolean;
  /** Size variant — default matches order form */
  size?: "default" | "sm";
}

export function WilayaCommuneSelect({
  wilaya,
  commune,
  onWilayaChange,
  onCommuneChange,
  layout = "grid",
  showLabels = true,
  wilayaLabel,
  communeLabel,
  disabled = false,
  required = false,
  size = "default",
}: WilayaCommuneSelectProps) {
  const { t, locale } = useI18n();
  const wilayas = wilayasData as Wilaya[];

  const [communes, setCommunes] = useState<Commune[]>([]);
  const [communesLoading, setCommunesLoading] = useState(false);

  const wilayaCode = useMemo(
    () => wilayas.find((w) => w.name === wilaya)?.code,
    [wilaya, wilayas],
  );

  // Fetch communes for the selected wilaya
  useEffect(() => {
    if (!wilayaCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: clear stale communes when wilaya is unselected
      setCommunes([]);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: set loading before async fetch
    setCommunesLoading(true);
    fetch(`/api/communes?wilaya=${wilayaCode}`)
      .then((res) => (res.ok ? res.json() : { communes: [] }))
      .then((data) => {
        if (!cancelled) setCommunes(data.communes ?? []);
      })
      .catch(() => {
        if (!cancelled) setCommunes([]);
      })
      .finally(() => {
        if (!cancelled) setCommunesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wilayaCode]);

  /** Returns the localized name for a wilaya or commune. */
  function localizeName(item: { name: string; nameAr: string }): string {
    if (locale === "ar") return item.nameAr || item.name;
    return item.name;
  }

  function handleWilayaChange(v: string) {
    onWilayaChange(v);
    onCommuneChange(""); // reset commune when wilaya changes
    setCommunes([]);
  }

  const containerClass = layout === "grid"
    ? "grid grid-cols-2 gap-3"
    : "flex flex-col gap-3";

  const labelClass = size === "sm" ? "text-xs" : "text-xs";
  const triggerClass = size === "sm" ? "h-8" : "";

  return (
    <div className={containerClass}>
      <div className="space-y-1.5">
        {showLabels && (
          <Label className={labelClass}>
            {wilayaLabel ?? t("orders.wilaya")}
            {required && <span className="text-destructive ms-0.5">*</span>}
          </Label>
        )}
        <Select
          value={wilaya}
          onValueChange={handleWilayaChange}
          disabled={disabled}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder={t("orders.form.wilayaPlaceholder")} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {wilayas.map((w) => (
              <SelectItem key={w.code} value={w.name}>
                {w.code.toString().padStart(2, "0")} — {localizeName(w)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        {showLabels && (
          <Label className={labelClass}>
            {communeLabel ?? t("orders.commune")}
            {required && <span className="text-destructive ms-0.5">*</span>}
          </Label>
        )}
        <Select
          value={commune}
          onValueChange={onCommuneChange}
          disabled={disabled || !wilaya}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue
              placeholder={
                wilaya
                  ? t("orders.form.selectCommunePlaceholder")
                  : t("orders.form.chooseWilayaFirst")
              }
            />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {communesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : communes.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {t("orders.form.noCommunes")}
              </div>
            ) : (
              communes.map((c) => (
                <SelectItem key={c.code} value={c.name}>
                  {localizeName(c)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
