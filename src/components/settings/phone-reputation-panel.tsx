"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Phone, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";

interface BadPhone {
  phone: string;
  reason: string;
  orderId?: string;
  at: string;
}

type LoadState = "loading" | "ready" | "error";

export function PhoneReputationPanel({ canManage }: { canManage: boolean }) {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [list, setList] = useState<BadPhone[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const loadList = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetch("/api/phone-reputation", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        list?: BadPhone[];
      };
      if (!response.ok || !Array.isArray(data.list)) {
        throw new Error(`phone-reputation:${response.status}`);
      }
      setList(data.list);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadList();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadList]);

  const addMutation = useApiMutation({
    successMessage: t("phoneReputation.added"),
    onSuccess: async () => {
      setPhone("");
      setReason("");
      await loadList();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="size-5" aria-hidden="true" />
          {t("settings.tabs.phoneReputation")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("phoneReputation.description")}
        </p>

        {canManage ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("phoneReputation.phoneLabel")}</Label>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="0X XX XX XX XX"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("phoneReputation.reasonLabel")}
              </Label>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("phoneReputation.reasonPlaceholder")}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                disabled={!phone.trim() || !reason.trim()}
                onClick={() =>
                  addMutation.submit("/api/phone-reputation", {
                    method: "POST",
                    body: JSON.stringify({
                      phone: phone.trim(),
                      reason: reason.trim(),
                    }),
                  })
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("common.add")}
              </Button>
            </div>
          </div>
        ) : null}

        {loadState === "loading" ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
            {copy("loading")}
          </div>
        ) : loadState === "error" ? (
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-warning/25 bg-warning/5 p-4">
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
              onClick={() => void loadList()}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {copy("retry")}
            </Button>
          </div>
        ) : list.length > 0 ? (
          <div className="space-y-1.5">
            {list.map((entry) => (
              <div
                key={`${entry.phone}:${entry.at}`}
                className="flex items-center justify-between rounded-lg border p-2.5"
              >
                <div>
                  <p className="font-mono text-sm" dir="ltr">
                    {entry.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.reason} · {new Date(entry.at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
            {t("phoneReputation.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
