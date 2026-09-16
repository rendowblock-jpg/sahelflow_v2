"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

export interface GatesConfigRow {
  storefrontSlug: string;
  otpEnabled: boolean;
  otpLanguage: string;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  hasDzverifyApiKey: boolean;
  hasTurnstileSecretKey: boolean;
}

interface Props {
  storefronts: { slug: string; name: string }[];
  canManage: boolean;
}

type ApiPayload = { error?: string; code?: string; config?: GatesConfigRow };

/**
 * FD-061 EX-4: seller configuration of the storefront checkout gates.
 * Secrets are WRITE-ONLY (empty keeps, "-" clears — the stored value is
 * never echoed back); arming a gate without its secret is rejected by the
 * service fail-closed. Disabled gates are inert — zero behavior change.
 */
export function StorefrontGatesManager({ storefronts, canManage }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(storefronts[0]?.slug ?? "");
  const [config, setConfig] = useState<GatesConfigRow | null>(null);
  const [form, setForm] = useState({
    otpEnabled: false,
    otpLanguage: "ar",
    dzverifyApiKey: "",
    turnstileEnabled: false,
    turnstileSiteKey: "",
    turnstileSecretKey: "",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!slug) return;
      setConfig(null);
      try {
        const response = await fetch(
          `/api/storefront/gates?slug=${encodeURIComponent(slug)}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as { config?: GatesConfigRow | null };
        if (cancelled) return;
        setConfig(data.config ?? null);
        setForm({
          otpEnabled: data.config?.otpEnabled ?? false,
          otpLanguage: data.config?.otpLanguage ?? "ar",
          dzverifyApiKey: "",
          turnstileEnabled: data.config?.turnstileEnabled ?? false,
          turnstileSiteKey: data.config?.turnstileSiteKey ?? "",
          turnstileSecretKey: "",
        });
      } catch {
        // The probe failing leaves the form inert; a save attempt surfaces
        // the error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/storefront/gates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storefrontSlug: slug,
          otpEnabled: form.otpEnabled,
          otpLanguage: form.otpLanguage,
          // Write-only secret semantics: empty keeps, "-" clears.
          dzverifyApiKey: form.dzverifyApiKey,
          turnstileEnabled: form.turnstileEnabled,
          turnstileSiteKey: form.turnstileSiteKey.trim() || null,
          turnstileSecretKey: form.turnstileSecretKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) {
        toast.error(data.error ?? t("storefronts.gates.error"));
        return;
      }
      toast.success(t("storefronts.gates.savedToast"));
      setConfig(data.config ?? null);
      setForm((current) => ({ ...current, dzverifyApiKey: "", turnstileSecretKey: "" }));
      router.refresh();
    } catch {
      toast.error(t("storefronts.gates.error"));
    } finally {
      setBusy(false);
    }
  }

  if (storefronts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("storefronts.gates.title")}</CardTitle>
          <CardDescription>{t("storefronts.gates.description")}</CardDescription>
        </div>
        {canManage && storefronts.length > 1 ? (
          <select
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            aria-label={t("storefronts.gates.storefront")}
            className="h-9 rounded-control border bg-background px-3 text-sm"
          >
            {storefronts.map((storefront) => (
              <option key={storefront.slug} value={storefront.slug}>
                {storefront.name}
              </option>
            ))}
          </select>
        ) : null}
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-control border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="gates-otp" className="text-sm font-medium">
                  {t("storefronts.gates.otpTitle")}
                </Label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    id="gates-otp"
                    type="checkbox"
                    checked={form.otpEnabled}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, otpEnabled: event.target.checked }))
                    }
                  />
                  {form.otpEnabled ? (
                    <Badge variant="outline" className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                      {t("storefronts.gates.armed")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("storefronts.gates.inert")}</Badge>
                  )}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t("storefronts.gates.otpDescription")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gates-otp-lang">{t("storefronts.gates.otpLanguage")}</Label>
                  <select
                    id="gates-otp-lang"
                    value={form.otpLanguage}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, otpLanguage: event.target.value }))
                    }
                    className="h-9 w-full rounded-control border bg-background px-2 text-sm"
                  >
                    <option value="ar">العربية</option>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gates-dzverify-key">
                    {t("storefronts.gates.dzverifyKey")}
                    {config?.hasDzverifyApiKey ? " ✓" : ""}
                  </Label>
                  <Input
                    id="gates-dzverify-key"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      config?.hasDzverifyApiKey
                        ? t("storefronts.gates.secretStored")
                        : t("storefronts.gates.secretMissing")
                    }
                    value={form.dzverifyApiKey}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, dzverifyApiKey: event.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-control border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="gates-turnstile" className="text-sm font-medium">
                  {t("storefronts.gates.turnstileTitle")}
                </Label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    id="gates-turnstile"
                    type="checkbox"
                    checked={form.turnstileEnabled}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, turnstileEnabled: event.target.checked }))
                    }
                  />
                  {form.turnstileEnabled ? (
                    <Badge variant="outline" className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                      {t("storefronts.gates.armed")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("storefronts.gates.inert")}</Badge>
                  )}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t("storefronts.gates.turnstileDescription")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gates-turnstile-site">{t("storefronts.gates.turnstileSiteKey")}</Label>
                  <Input
                    id="gates-turnstile-site"
                    value={form.turnstileSiteKey}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, turnstileSiteKey: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gates-turnstile-secret">
                    {t("storefronts.gates.turnstileSecretKey")}
                    {config?.hasTurnstileSecretKey ? " ✓" : ""}
                  </Label>
                  <Input
                    id="gates-turnstile-secret"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      config?.hasTurnstileSecretKey
                        ? t("storefronts.gates.secretStored")
                        : t("storefronts.gates.secretMissing")
                    }
                    value={form.turnstileSecretKey}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, turnstileSecretKey: event.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {canManage ? (
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-4" aria-hidden="true" />
              )}
              {t("storefronts.gates.save")}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
