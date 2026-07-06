"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Plus } from "lucide-react";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useI18n } from "@/hooks/use-i18n";

interface BadPhone {
  phone: string;
  reason: string;
  orderId?: string;
  at: string;
}

export function PhoneReputationPanel() {
  const { t } = useI18n();
  const [list, setList] = useState<BadPhone[]>([]);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch("/api/phone-reputation")
      .then((r) => r.json())
      .then((d) => setList(d.list ?? []))
      .catch(() => {});
  }, []);

  const addMutation = useApiMutation({
    successMessage: t("phoneReputation.added"),
    onSuccess: async () => {
      const res = await fetch("/api/phone-reputation");
      const d = await res.json();
      setList(d.list ?? []);
      setPhone("");
      setReason("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          {t("settings.tabs.phoneReputation")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("phoneReputation.description")}
        </p>

        {/* Add bad phone */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("phoneReputation.phoneLabel")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0X XX XX XX XX" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("phoneReputation.reasonLabel")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("phoneReputation.reasonPlaceholder")} />
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              disabled={!phone || !reason}
              onClick={() => addMutation.submit("/api/phone-reputation", {
                method: "POST",
                body: JSON.stringify({ phone, reason }),
              })}
            >
              <Plus className="me-1 h-4 w-4" />{t("common.add")}
            </Button>
          </div>
        </div>

        {/* List */}
        {list.length > 0 ? (
          <div className="space-y-1.5">
            {list.map((entry, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-2.5">
                <div>
                  <p className="text-sm font-mono">{entry.phone}</p>
                  <p className="text-xs text-muted-foreground">{entry.reason} · {new Date(entry.at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed">
            {t("phoneReputation.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
