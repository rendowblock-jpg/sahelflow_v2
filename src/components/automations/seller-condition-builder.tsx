"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import {
  conditionValueForEditor,
  getSellerTriggerSpec,
  type SellerConditionOperator,
} from "@/lib/automations/catalog";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";
import { cn } from "@/lib/utils";

export type SellerConditionDraft = {
  field: string;
  operator: SellerConditionOperator;
  value: string;
};

export type SellerConditionGroupDraft =
  | { all: SellerConditionDraft[] }
  | { any: SellerConditionDraft[] }
  | null;

interface Props {
  trigger: string;
  value: SellerConditionGroupDraft;
  onChange: (value: SellerConditionGroupDraft) => void;
  disabled?: boolean;
}

function operatorLabelKey(operator: SellerConditionOperator): string {
  if (operator === "greater_than_or_equal") return "conditionBuilder.op.gte";
  if (operator === "less_than_or_equal") return "conditionBuilder.op.lte";
  return `conditionBuilder.op.${operator}`;
}

function hasValue(operator: SellerConditionOperator): boolean {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

export function SellerConditionBuilder({
  trigger,
  value,
  onChange,
  disabled = false,
}: Props) {
  const { t, locale } = useI18n();
  const c = (key: AutomationWorkspaceCopyKey) =>
    getAutomationWorkspaceCopy(locale, key);
  const spec = getSellerTriggerSpec(trigger);
  const mode: "all" | "any" = value && "any" in value ? "any" : "all";
  const conditions = value ? ("all" in value ? value.all : value.any) : [];
  const fields = spec?.fields ?? [];

  const write = (next: SellerConditionDraft[], nextMode = mode) => {
    if (next.length === 0) {
      onChange(null);
      return;
    }
    onChange(nextMode === "all" ? { all: next } : { any: next });
  };

  const addCondition = () => {
    const first = fields[0];
    if (!first) return;
    write([
      ...conditions,
      {
        field: first.value,
        operator: first.operators[0] ?? "equal",
        value: "",
      },
    ]);
  };

  const updateCondition = (
    index: number,
    patch: Partial<SellerConditionDraft>,
  ) => {
    write(
      conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition,
      ),
    );
  };

  const switchMode = (nextMode: "all" | "any") => {
    if (conditions.length === 0) return;
    write(conditions, nextMode);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Label>{c("builder.ifTitle")}</Label>
          <p className="text-xs text-muted-foreground">{c("builder.ifHint")}</p>
        </div>
        {conditions.length > 0 ? (
          <div
            className="flex items-center gap-1 rounded-lg border border-border/70 bg-background p-1"
            role="group"
            aria-label={c("condition.field")}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => switchMode("all")}
              aria-pressed={mode === "all"}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c("condition.matchAll")}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => switchMode("any")}
              aria-pressed={mode === "any"}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "any"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c("condition.matchAny")}
            </button>
          </div>
        ) : null}
      </div>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {c("condition.noFields")}
        </p>
      ) : conditions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 p-4">
          <p className="text-sm font-medium">{c("workspace.always")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {c("builder.noConditions")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conditions.map((condition, index) => {
            const currentField =
              fields.find((item) => item.value === condition.field) ?? fields[0];
            const operator = currentField?.operators.includes(condition.operator)
              ? condition.operator
              : (currentField?.operators[0] ?? "equal");
            const valueVisible = hasValue(operator);
            const technical =
              currentField?.type === "number" || currentField?.type === "phone";
            const fieldControlId = `automation-condition-${index}-field`;
            const operatorControlId = `automation-condition-${index}-operator`;
            const valueControlId = `automation-condition-${index}-value`;

            return (
              <div
                key={`${condition.field}-${index}`}
                className="grid gap-2 rounded-lg border border-border/60 bg-background p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto] sm:items-end"
              >
                <div className="space-y-1.5">
                  <Label
                    htmlFor={fieldControlId}
                    className="text-xs text-muted-foreground"
                  >
                    {c("condition.field")}
                  </Label>
                  <Select
                    value={condition.field}
                    disabled={disabled}
                    onValueChange={(nextField) => {
                      const nextSpec = fields.find(
                        (item) => item.value === nextField,
                      );
                      updateCondition(index, {
                        field: nextField,
                        operator: nextSpec?.operators[0] ?? "equal",
                        value: "",
                      });
                    }}
                  >
                    <SelectTrigger id={fieldControlId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {c(item.copyKey as AutomationWorkspaceCopyKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={operatorControlId}
                    className="text-xs text-muted-foreground"
                  >
                    {c("condition.operator")}
                  </Label>
                  <Select
                    value={operator}
                    disabled={disabled}
                    onValueChange={(nextOperator) =>
                      updateCondition(index, {
                        operator: nextOperator as SellerConditionOperator,
                      })
                    }
                  >
                    <SelectTrigger id={operatorControlId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(currentField?.operators ?? []).map((item) => (
                        <SelectItem key={item} value={item}>
                          {t(operatorLabelKey(item))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  {valueVisible ? (
                    <>
                      <Label
                        htmlFor={valueControlId}
                        className="text-xs text-muted-foreground"
                      >
                        {c("condition.value")}
                      </Label>
                      <Input
                        id={valueControlId}
                        value={conditionValueForEditor(condition.value)}
                        disabled={disabled}
                        dir={technical ? "ltr" : undefined}
                        inputMode={currentField?.type === "number" ? "decimal" : undefined}
                        onChange={(event) =>
                          updateCondition(index, { value: event.target.value })
                        }
                      />
                      {(operator === "in" || operator === "not_in") && (
                        <p className="text-2xs text-muted-foreground">
                          {c("condition.arrayHint")}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {c("condition.value")}
                      </span>
                      <div
                        aria-hidden="true"
                        className="flex h-9 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground"
                      >
                        —
                      </div>
                    </>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() =>
                    write(conditions.filter((_, position) => position !== index))
                  }
                  aria-label={t("common.delete")}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addCondition}
        disabled={disabled || fields.length === 0 || conditions.length >= 20}
      >
        <Plus className="me-1.5 h-4 w-4" />
        {c("condition.add")}
      </Button>
    </div>
  );
}
