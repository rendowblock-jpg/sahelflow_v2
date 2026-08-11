"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Bell, Loader2, RefreshCw, Save, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { toast } from "@/lib/toast";

interface DailyReportSettings {
  daily_report_enabled: string;
  daily_report_phone: string;
  daily_report_time: string;
}

type LoadState = "loading" | "ready" | "error";

const EMPTY_SETTINGS: DailyReportSettings = {
  daily_report_enabled: "false",
  daily_report_phone: "",
  daily_report_time: "09:00",
};

export function DailyReportPanel() {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [settings, setSettings] = useState<DailyReportSettings>(EMPTY_SETTINGS);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pending, startTransition] = useTransition();

  const loadSettings = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) throw new Error(`settings:${response.status}`);
      const data = (await response.json()) as {
        settings: Record<string, string>;
      };
      setSettings({
        daily_report_enabled: data.settings.daily_report_enabled ?? "false",
        daily_report_phone: data.settings.daily_report_phone ?? "",
        daily_report_time: data.settings.daily_report_time ?? "09:00",
      });
      setLoadState("ready");
    } catch {
      // Unavailable settings authority is not equivalent to disabled/default
      // configuration. Keep the last visible state but stop treating it as truth.
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  function handleSave() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || t("reports.saveFailed"));
        }
        toast.success(t("reports.settingsSaved"));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("reports.errorShort"),
        );
      }
    });
  }

  function handleTestReport() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/reports/daily?trigger=manual", {
          method: "POST",
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          accepted?: boolean;
          skipped?: string;
          reason?: string;
          state?: string;
          error?: string;
        };
        if (response.ok && data.ok && data.skipped) {
          toast.info(
            t("reports.reportInfo", { reason: String(data.skipped) }),
          );
        } else if (response.ok && data.ok) {
          toast.success(t("reports.reportSent"));
        } else if (data.accepted) {
          toast.info(
            t("reports.reportInfo", {
              reason: String(data.state ?? "queued"),
            }),
          );
        } else if (data.reason) {
          toast.info(
            t("reports.reportInfo", { reason: String(data.reason) }),
          );
        } else {
          toast.error(data.error || t("reports.failedShort"));
        }
      } catch {
        toast.error(t("reports.connectionError"));
      }
    });
  }

  if (loadState === "loading") {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (loadState === "error") {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold">{copy("unavailable")}</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {copy("unavailableDescription")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadSettings()}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {copy("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-5" aria-hidden="true" />
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
            onCheckedChange={(value) =>
              setSettings((current) => ({
                ...current,
                daily_report_enabled: value ? "true" : "false",
              }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="report-phone">{t("reports.phoneLabel")}</Label>
            <Input
              id="report-phone"
              value={settings.daily_report_phone}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  daily_report_phone: event.target.value,
                }))
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
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  daily_report_time: event.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("reports.timeFormatHint")}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {t("common.save")}
          </Button>
          <Button
            onClick={handleTestReport}
            variant="outline"
            disabled={pending}
          >
            <Send className="size-4 icon-rtl-flip" aria-hidden="true" />
            {t("reports.testNow")}
          </Button>
        </div>

        <details className="rounded-md border border-border/50 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted/30">
            {t("reports.advancedConfig")}
          </summary>
          <div className="space-y-2 px-3 pb-3">
            <p>{t("reports.cronHelp")}</p>
            <pre className="overflow-x-auto rounded bg-muted/50 p-2 font-mono">
              0 9 * * * curl -X POST -H &quot;x-cron-secret: $SECRET&quot; http://localhost:3000/api/reports/daily
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
