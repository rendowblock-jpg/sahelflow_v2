"use client";

import { env } from "@/lib/env";
import { useState, useEffect, useTransition } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Bell, Loader2, Save, Send } from "lucide-react";

interface DailyReportSettings {
  daily_report_enabled: string;
  daily_report_phone: string;
  daily_report_time: string;
}

export function DailyReportPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<DailyReportSettings>({
    daily_report_enabled: "false",
    daily_report_phone: "",
    daily_report_time: "09:00",
  });
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = (await res.json()) as { settings: Record<string, string> };
          setSettings({
            daily_report_enabled: data.settings.daily_report_enabled ?? "false",
            daily_report_phone: data.settings.daily_report_phone ?? "",
            daily_report_time: data.settings.daily_report_time ?? "09:00",
          });
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || t("reports.saveFailed"));
        }
        toast.success(t("reports.settingsSaved"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("reports.errorShort"));
      }
    });
  }

  async function handleTestReport() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/reports/daily", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": env.publicCronSecret ?? "dev",
          },
        });
        const data = await res.json();
        if (data.ok) {
          toast.success(t("reports.reportSent"));
        } else if (data.reason) {
          toast.info(t("reports.reportInfo", { reason: String(data.reason) }));
        } else {
          toast.error(data.error || t("reports.failedShort"));
        }
      } catch {
        toast.error(t("reports.connectionError"));
      }
    });
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-5 w-5" />
          {t("reports.dailyTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("reports.dailyDesc")}
        </p>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="cursor-pointer">{t("reports.enableDaily")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("reports.enableDailyHint")}
            </p>
          </div>
          <Switch
            checked={settings.daily_report_enabled === "true"}
            onCheckedChange={(v) =>
              setSettings({ ...settings, daily_report_enabled: v ? "true" : "false" })
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="report-phone">{t("reports.phoneLabel")}</Label>
            <Input
              id="report-phone"
              value={settings.daily_report_phone}
              onChange={(e) =>
                setSettings({ ...settings, daily_report_phone: e.target.value })
              }
              placeholder="213555123456"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t("reports.phoneFormatHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-time">{t("reports.timeLabel")}</Label>
            <Input
              id="report-time"
              type="time"
              value={settings.daily_report_time}
              onChange={(e) =>
                setSettings({ ...settings, daily_report_time: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("reports.timeFormatHint")}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {t("common.save")}
          </Button>
          <Button onClick={handleTestReport} variant="outline" disabled={pending}>
            <Send className="h-4 w-4 mr-2" />
            {t("reports.testNow")}
          </Button>
        </div>

        <details className="rounded-md border border-border/50 text-xs text-muted-foreground">
          <summary className="cursor-pointer px-3 py-2 font-medium hover:bg-muted/30 transition-colors select-none">
            {t("reports.advancedConfig")}
          </summary>
          <div className="px-3 pb-3 space-y-2">
            <p>{t("reports.cronHelp")}</p>
            <pre className="font-mono bg-muted/50 p-2 rounded overflow-x-auto">
              0 9 * * * curl -X POST -H &quot;x-cron-secret: $SECRET&quot; http://localhost:3000/api/reports/daily
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
