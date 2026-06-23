"use client";

import { env } from "@/lib/env";
import { useState, useEffect, useTransition } from "react";
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
          throw new Error(data.error || "Échec de l'enregistrement");
        }
        toast.success("Réglages enregistrés");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
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
          toast.success("Rapport envoyé (vérifiez WhatsApp)");
        } else if (data.reason) {
          toast.info(`Rapport: ${data.reason}`);
        } else {
          toast.error(data.error || "Échec");
        }
      } catch {
        toast.error("Erreur de connexion");
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
          Rapport quotidien WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Recevez un résumé quotidien de votre activité (commandes, chiffre
          d&apos;affaires, livraisons, top produits, stock faible) directement
          sur WhatsApp.
        </p>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="cursor-pointer">Activer le rapport quotidien</Label>
            <p className="text-xs text-muted-foreground">
              Envoi automatique chaque jour à l&apos;heure configurée
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
            <Label htmlFor="report-phone">Numéro WhatsApp (destinataire)</Label>
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
              Format international sans + ni espaces
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-time">Heure d&apos;envoi</Label>
            <Input
              id="report-time"
              type="time"
              value={settings.daily_report_time}
              onChange={(e) =>
                setSettings({ ...settings, daily_report_time: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Heure locale (format 24h)
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Enregistrer
          </Button>
          <Button onClick={handleTestReport} variant="outline" disabled={pending}>
            <Send className="h-4 w-4 mr-2" />
            Tester maintenant
          </Button>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">Configuration du cron :</p>
          <p>
            Configurez un cron externe qui appelle{" "}
            <code className="font-mono">POST /api/reports/daily</code> avec le
            header{" "}
            <code className="font-mono">x-cron-secret: $CRON_SECRET</code> à
            l&apos;heure souhaitée. Exemple crontab (09:00 chaque jour) :
          </p>
          <pre className="mt-1 font-mono bg-background p-2 rounded overflow-x-auto">
            0 9 * * * curl -X POST -H &quot;x-cron-secret: $SECRET&quot; http://localhost:3000/api/reports/daily
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
