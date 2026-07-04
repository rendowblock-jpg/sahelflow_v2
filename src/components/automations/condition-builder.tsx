"use client";

/**
 * ConditionBuilder — visual rule builder for automation conditions (Phase 6).
 *
 * Outputs JSON-logic in the format the conditions engine expects:
 *   { "all": [{ "field": "wilaya", "operator": "equal", "value": "Alger" }] }
 *   { "any": [{ "field": "totalPrice", "operator": "greater_than", "value": 5000 }] }
 *
 * Supports add/remove conditions, switch between all/any.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

const FIELDS = [
  { value: "wilaya", label: "Wilaya", type: "text" },
  { value: "commune", label: "Commune", type: "text" },
  { value: "totalPrice", label: "Total Price (DZD)", type: "number" },
  { value: "status", label: "Order Status", type: "text" },
  { value: "customerName", label: "Customer Name", type: "text" },
  { value: "customerPhone", label: "Customer Phone", type: "text" },
  { value: "orderNumber", label: "Order Number", type: "text" },
  { value: "source", label: "Source", type: "text" },
];

const OPERATORS = [
  { value: "equal", label: "equals" },
  { value: "not_equal", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "greater_than_or_equal", label: "≥" },
  { value: "less_than_or_equal", label: "≤" },
  { value: "in", label: "in (comma-separated)" },
  { value: "not_in", label: "not in" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty"];

export function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
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
        <span className="text-sm font-medium">Match</span>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => switchMode("all")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            ALL (and)
          </button>
          <button
            type="button"
            onClick={() => switchMode("any")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "any" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            ANY (or)
          </button>
        </div>
        <span className="text-sm text-muted-foreground">of the following conditions:</span>
      </div>

      {/* Conditions */}
      {conditions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No conditions — this automation fires on every trigger event.
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((cond, i) => {
            const field = FIELDS.find((f) => f.value === cond.field);
            const needsValue = !NO_VALUE_OPERATORS.includes(cond.operator);
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    {mode === "all" ? "and" : "or"}
                  </span>
                )}
                <Select value={cond.field} onValueChange={(v) => updateCondition(i, { field: v })}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cond.operator} onValueChange={(v) => updateCondition(i, { operator: v })}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsValue && (
                  <Input
                    className="flex-1"
                    value={cond.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder={field?.type === "number" ? "e.g. 5000" : "e.g. Alger"}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCondition(i)}
                  className="text-destructive shrink-0"
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
        Add condition
      </Button>
    </div>
  );
}
