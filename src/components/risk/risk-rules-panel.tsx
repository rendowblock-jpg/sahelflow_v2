"use client";

/**
 * Risk rules panel — lets the seller enable/disable risk rules.
 *
 * Shows each rule with its label, trigger count, and a toggle switch.
 * Persists via PUT /api/risk/rules.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/use-i18n";
import type { RiskRule } from "@/lib/risk-engine/types";

interface Props {
  rules: RiskRule[];
}

export function RiskRulesPanel({ rules: initialRules }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [savingId, setSavingId] = useState<string | null>(null);

  const toggleRule = async (ruleId: string) => {
    const updated = rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
    );
    setRules(updated);
    setSavingId(ruleId);
    try {
      const res = await fetch("/api/risk/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: updated }),
      });
      if (!res.ok) throw new Error(t("error.saveFailed"));
      toast.success(t("risk.control.saved"));
      router.refresh();
    } catch {
      toast.error(t("error.toggleFailed"));
      // Revert on failure
      setRules(initialRules);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="text-base">{t("risk.rules.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("risk.rules.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">—</div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{t(rule.labelKey)}</span>
                    <Badge variant={rule.enabled ? "default" : "secondary"} className="text-[10px]">
                      {rule.enabled ? t("risk.rules.enabled") : t("risk.rules.disabled")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("risk.rules.triggerCount")}: <span className="tabular-nums font-medium">{rule.triggerCount}</span>
                  </p>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={() => toggleRule(rule.id)}
                  disabled={savingId === rule.id}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
