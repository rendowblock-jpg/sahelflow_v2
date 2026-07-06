"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Download, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/use-i18n";

export function DangerZonePanel() {
  const { t } = useI18n();
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (confirmText !== "RESET") {
      toast.error(t("settings.dangerZone.typeReset"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      if (!res.ok) throw new Error(t("settings.dangerZone.resetFailed"));
      toast.success(t("settings.dangerZone.resetSuccess"));
      window.location.href = "/setup";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.dangerZone.resetFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          {t("settings.tabs.dangerZone")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export all */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("settings.dangerZone.exportAll")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.dangerZone.exportDesc")}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/export/orders"><Download className="me-2 h-4 w-4" />{t("common.export")}</a>
          </Button>
        </div>

        {/* Reset database */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-destructive">{t("settings.dangerZone.resetDatabase")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.dangerZone.resetWarning")}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("settings.dangerZone.typeReset")}</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              className="max-w-xs"
            />
          </div>
          <Button variant="destructive" size="sm" onClick={handleReset} disabled={loading || confirmText !== "RESET"}>
            <Trash2 className="me-2 h-4 w-4" />
            {loading ? t("settings.dangerZone.resetting") : t("settings.dangerZone.resetEverything")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
