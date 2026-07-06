"use client";

/**
 * Risk control panel — lets the seller tune the risk engine.
 *
 * Controls:
 *   - Factor weights (5 sliders: customerHistory, geography, orderValue, contactQuality, behavior)
 *   - Level thresholds (3 number inputs: low, medium, high)
 *   - Auto-actions (3 toggles)
 *   - Auto-blacklist return-rate threshold (1 number input)
 *
 * Persists via PUT /api/risk/config. Shows a toast on save.
 * Includes a "Reset to defaults" button (with confirm dialog).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useI18n } from "@/hooks/use-i18n";
import { DEFAULT_RISK_CONFIG, type RiskEngineConfig } from "@/lib/risk-engine/types";
import { Save, RotateCcw } from "lucide-react";

interface Props {
  config: RiskEngineConfig;
}

export function RiskControlPanel({ config: initialConfig }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const updateWeight = (key: keyof RiskEngineConfig["weights"], value: number) => {
    setConfig((c) => ({ ...c, weights: { ...c.weights, [key]: value } }));
  };

  const updateThreshold = (key: keyof RiskEngineConfig["thresholds"], value: number) => {
    setConfig((c) => ({ ...c, thresholds: { ...c.thresholds, [key]: value } }));
  };

  const updateAutoAction = (key: keyof RiskEngineConfig["autoActions"], value: boolean) => {
    setConfig((c) => ({ ...c, autoActions: { ...c.autoActions, [key]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/risk/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(t("error.saveFailed"));
      toast.success(t("risk.control.saved"));
      router.refresh();
    } catch {
      toast.error(t("error.saveConfigFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/risk/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DEFAULT_RISK_CONFIG),
      });
      if (!res.ok) throw new Error(t("error.resetFailed"));
      setConfig(DEFAULT_RISK_CONFIG);
      toast.success(t("risk.control.saved"));
      router.refresh();
    } catch {
      toast.error(t("error.resetFailed"));
    } finally {
      setSaving(false);
      setResetOpen(false);
    }
  };

  const weightEntries: Array<{ key: keyof RiskEngineConfig["weights"]; labelKey: string }> = [
    { key: "customerHistory", labelKey: "risk.control.weights.customerHistory" },
    { key: "geography", labelKey: "risk.control.weights.geography" },
    { key: "orderValue", labelKey: "risk.control.weights.orderValue" },
    { key: "contactQuality", labelKey: "risk.control.weights.contactQuality" },
    { key: "behavior", labelKey: "risk.control.weights.behavior" },
  ];

  return (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="text-base">{t("risk.control.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("risk.control.subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Weights */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t("risk.control.weights")}</h3>
            {weightEntries.map(({ key, labelKey }) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t(labelKey)}</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {config.weights[key].toFixed(1)}×
                  </span>
                </div>
                <Slider
                  value={[config.weights[key]]}
                  onValueChange={(vals) => updateWeight(key, vals[0] ?? 0)}
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>
            ))}
          </div>

          {/* Thresholds */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t("risk.control.thresholds")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{t("risk.control.thresholds.low")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.thresholds.low}
                  onChange={(e) => updateThreshold("low", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("risk.control.thresholds.medium")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.thresholds.medium}
                  onChange={(e) => updateThreshold("medium", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("risk.control.thresholds.high")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.thresholds.high}
                  onChange={(e) => updateThreshold("high", Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Auto-actions */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t("risk.control.autoActions")}</h3>
            <div className="space-y-3">
              {([
                { key: "autoConfirmLow", labelKey: "risk.control.autoActions.autoConfirmLow" },
                { key: "autoHoldCritical", labelKey: "risk.control.autoActions.autoHoldCritical" },
                { key: "autoFlagBlacklist", labelKey: "risk.control.autoActions.autoFlagBlacklist" },
              ] as const).map(({ key, labelKey }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="text-sm font-normal cursor-pointer">{t(labelKey)}</Label>
                  <Switch
                    checked={config.autoActions[key]}
                    onCheckedChange={(v) => updateAutoAction(key, v)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Auto-blacklist threshold */}
          <div className="space-y-2">
            <Label className="text-sm">{t("risk.control.autoBlacklistReturnRate")}</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={config.autoBlacklistReturnRate}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    autoBlacklistReturnRate: Number(e.target.value),
                  }))
                }
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">
                ({(config.autoBlacklistReturnRate * 100).toFixed(0)}%)
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="me-2 h-4 w-4" />
              {saving ? "..." : t("risk.control.save")}
            </Button>
            <Button variant="outline" onClick={() => setResetOpen(true)} disabled={saving}>
              <RotateCcw className="me-2 h-4 w-4" />
              {t("risk.control.reset")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("risk.control.reset")}
        description={t("risk.control.resetConfirm")}
        onConfirm={handleReset}
      />
    </div>
  );
}
