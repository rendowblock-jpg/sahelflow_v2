"use client";

/**
 * ConditionBuilder — visual rule builder for automation conditions (Phase 6).
 *
 * Outputs JSON-logic in the format the conditions engine expects:
 *   { "all": [{ "field": "wilaya", "operator": "equal", "value": "Alger" }] }
 *   { "any": [{ "field": "totalPrice", "operator": "greater_than", "value": 5000 }] }
 *
 * Supports add/remove conditions, switch between all/any.
 * Fully i18n'd (AR/FR/EN).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

export interface Condition {
  field: string;
  operator: string;
  value: string;
}

export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
}

interface ConditionBuilderProps {
  value: ConditionGroup | null;
  onChange: (value: ConditionGroup | null) => void;
}

/** Field definitions — labels are i18n keys resolved in render. */
const FIELDS = [
  { value: "wilaya", labelKey: "conditionBuilder.field.wilaya", type: "text" },
  { value: "commune", labelKey: "conditionBuilder.field.commune", type: "text" },
  { value: "totalPrice", labelKey: "conditionBuilder.field.totalPrice", type: "number" },
  { value: "status", labelKey: "conditionBuilder.field.status", type: "text" },
  { value: "customerName", labelKey: "conditionBuilder.field.customerName", type: "text" },
  { value: "customerPhone", labelKey: "conditionBuilder.field.customerPhone", type: "text" },
  { value: "orderNumber", labelKey: "conditionBuilder.field.orderNumber", type: "text" },
  { value: "source", labelKey: "conditionBuilder.field.source", type: "text" },
];

/** Operator definitions — labels are i18n keys resolved in render. */
const OPERATORS = [
  { value: "equal", labelKey: "conditionBuilder.op.equal" },
  { value: "not_equal", labelKey: "conditionBuilder.op.not_equal" },
  { value: "contains", labelKey: "conditionBuilder.op.contains" },
  { value: "not_contains", labelKey: "conditionBuilder.op.not_contains" },
  { value: "starts_with", labelKey: "conditionBuilder.op.starts_with" },
  { value: "ends_with", labelKey: "conditionBuilder.op.ends_with" },
  { value: "greater_than", labelKey: "conditionBuilder.op.greater_than" },
  { value: "less_than", labelKey: "conditionBuilder.op.less_than" },
  { value: "greater_than_or_equal", labelKey: "conditionBuilder.op.gte" },
  { value: "less_than_or_equal", labelKey: "conditionBuilder.op.lte" },
  { value: "in", labelKey: "conditionBuilder.op.in" },
  { value: "not_in", labelKey: "conditionBuilder.op.not_in" },
  { value: "is_empty", labelKey: "conditionBuilder.op.is_empty" },
  { value: "is_not_empty", labelKey: "conditionBuilder.op.is_not_empty" },
];

const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty"];

export function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"all" | "any">(
    value?.all ? "all" : value?.any ? "any" : "all"
  );
  const conditions = value?.all ?? value?.any ?? [];

  const updateConditions = (newConditions: Condition[]) => {
    if (newConditions.length === 0) {
      onChange(null);
      return;
    }
    onChange(mode === "all" ? { all: newConditions } : { any: newConditions });
  };

  const switchMode = (newMode: "all" | "any") => {
    setMode(newMode);
    if (conditions.length > 0) {
      onChange(newMode === "all" ? { all: conditions } : { any: conditions });
    }
  };

  const addCondition = () => {
    updateConditions([...conditions, { field: "wilaya", operator: "equal", value: "" }]);
  };

  const removeCondition = (index: number) => {
    updateConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    updateConditions(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      {/* Mode switcher */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{t("conditionBuilder.match")}</span>
        <div className="flex items-center gap-1 rounded-md border p-0.5" role="group" aria-label={t("conditionBuilder.match")}>
          <button
            type="button"
            onClick={() => switchMode("all")}
            aria-pressed={mode === "all"}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("conditionBuilder.matchAll")}
          </button>
          <button
            type="button"
            onClick={() => switchMode("any")}
            aria-pressed={mode === "any"}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "any" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("conditionBuilder.matchAny")}
          </button>
        </div>
        <span className="text-sm text-muted-foreground">{t("conditionBuilder.ofFollowing")}</span>
      </div>

      {/* Conditions */}
      {conditions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          {t("conditionBuilder.noConditions")}
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((cond, i) => {
            const field = FIELDS.find((f) => f.value === cond.field);
            const needsValue = !NO_VALUE_OPERATORS.includes(cond.operator);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                {i > 0 && (
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    {mode === "all" ? t("conditionBuilder.and") : t("conditionBuilder.or")}
                  </span>
                )}
                <Select value={cond.field} onValueChange={(v) => updateCondition(i, { field: v })}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{t(f.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cond.operator} onValueChange={(v) => updateCondition(i, { operator: v })}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsValue && (
                  <Input
                    className="flex-1 min-w-[120px]"
                    value={cond.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder={field?.type === "number" ? "e.g. 5000" : "e.g. Alger"}
                    aria-label={t("conditionBuilder.value") || "Value"}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCondition(i)}
                  className="text-destructive shrink-0"
                  aria-label={t("common.delete") || "Remove condition"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add condition button */}
      <Button type="button" variant="outline" size="sm" onClick={addCondition}>
        <Plus className="h-3.5 w-3.5 me-1" />
        {t("conditionBuilder.addCondition")}
      </Button>
    </div>
  );
}
