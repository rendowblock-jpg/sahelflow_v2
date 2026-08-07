"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, User } from "lucide-react";

import { PhotoUpload } from "@/components/shared/photo-upload";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface Profile {
  name?: string;
  email?: string;
  phone?: string;
  photo?: string;
  bio?: string;
}

export function ProfileEditor({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? t("error.requestFailed"));
      setProfile(data as Profile);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("error.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? t("profile.saveFailed"));
      toast.success(t("profile.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [canManage, profile, t]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("common.loading")}
      </div>
    );
  }
  if (loadError) {
    return (
      <StateSurface
        icon={AlertTriangle}
        title={t("error.requestFailed")}
        description={loadError}
        tone="danger"
        size="inline"
        role="alert"
        actions={<Button variant="outline" onClick={() => void load()}>{t("common.retry")}</Button>}
      />
    );
  }

  const initials = profile.name?.slice(0, 2) ?? "SF";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-5 text-muted-foreground" aria-hidden="true" />
          {t("profile.basicInfo")}
        </CardTitle>
        <CardDescription>{t("profile.basicInfoDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <PhotoUpload
          value={profile.photo ?? null}
          onChange={(url) => canManage && setProfile((current) => ({ ...current, photo: url ?? undefined }))}
          fallback={initials}
          size={96}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">{t("profile.name")}</Label>
            <Input id="name" value={profile.name ?? ""} readOnly={!canManage} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} placeholder={t("profile.namePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("profile.email")}</Label>
            <Input id="email" type="email" value={profile.email ?? ""} readOnly={!canManage} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} placeholder="contact@example.com" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("profile.phone")}</Label>
            <Input id="phone" value={profile.phone ?? ""} readOnly={!canManage} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="06 00 00 00 00" dir="ltr" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">{t("profile.bio")}</Label>
          <Textarea id="bio" value={profile.bio ?? ""} readOnly={!canManage} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} placeholder={t("profile.bioPlaceholder")} rows={3} />
        </div>

        {canManage ? (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" /> : <Save className="me-2 size-4" aria-hidden="true" />}
              {t("profile.save")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
