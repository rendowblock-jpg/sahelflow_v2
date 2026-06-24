"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, User } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "sonner";

interface Profile {
  name?: string;
  email?: string;
  phone?: string;
  photo?: string;
  bio?: string;
}

export default function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast.success(t("profile.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [profile, t]);

  if (loading) {
    return (
      <div className="app-content flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = profile.name?.slice(0, 2) ?? "SF";

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("profile.title")}
        description={t("profile.description")}
      />

      {/* Photo + basic info */}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-muted-foreground" />
            {t("profile.basicInfo")}
          </CardTitle>
          <CardDescription>{t("profile.basicInfoDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PhotoUpload
            value={profile.photo ?? null}
            onChange={(url) => setProfile((p) => ({ ...p, photo: url ?? undefined }))}
            fallback={initials}
            size={96}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("profile.name")}</Label>
              <Input
                id="name"
                value={profile.name ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("profile.namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("profile.email")}</Label>
              <Input
                id="email"
                type="email"
                value={profile.email ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                placeholder="contact@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t("profile.phone")}</Label>
              <Input
                id="phone"
                value={profile.phone ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="06 00 00 00 00"
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">{t("profile.bio")}</Label>
            <Textarea
              id="bio"
              value={profile.bio ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder={t("profile.bioPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
              {t("profile.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
