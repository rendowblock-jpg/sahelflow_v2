"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

import { PhotoUpload } from "@/components/shared/photo-upload";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import {
  DZ_PHONE_PLACEHOLDER,
  formatDZPhone,
  normalizeDZPhone,
} from "@/lib/validation/phone";

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
  // The last state the server confirmed — drives "unsaved changes" + Discard.
  const [savedProfile, setSavedProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const requestProfile = useCallback(async (): Promise<Profile> => {
    const response = await fetch("/api/profile", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? t("error.requestFailed"));
    const stored = data as Profile;
    // The phone is persisted canonically ("0555123456") and displayed masked
    // ("05 55 12 34 56"), exactly as every other DZ phone field in the app.
    return stored.phone
      ? { ...stored, phone: formatDZPhone(stored.phone) }
      : stored;
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void requestProfile()
      .then((data) => {
        if (!controller.signal.aborted) {
          setProfile(data);
          setSavedProfile(data);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : t("error.requestFailed"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestProfile, t]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await requestProfile();
      setProfile(data);
      setSavedProfile(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("error.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [requestProfile, t]);

  const handleSave = useCallback(async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // `src/lib/validation/phone.ts` owns the contract: submit the
        // normalized value, never the display mask.
        body: JSON.stringify(
          profile.phone
            ? { ...profile, phone: normalizeDZPhone(profile.phone) }
            : profile,
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? t("profile.saveFailed"));
      setSavedProfile(profile);
      toast.success(t("profile.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [canManage, profile, t]);

  if (loading) {
    // Structure-matching skeleton: heading, photo row and the field grid.
    return (
      <div className="space-y-5 py-7" role="status" aria-label={t("common.loading")}>
        <div className="space-y-2">
          <span className="block h-4 w-40 animate-pulse rounded-full bg-muted" />
          <span className="block h-3 w-64 animate-pulse rounded-full bg-muted" />
        </div>
        <span className="block h-24 animate-pulse rounded-surface bg-muted/60" />
        <div className="grid gap-4 sm:grid-cols-2">
          <span className="block h-9 animate-pulse rounded-control bg-muted/60 sm:col-span-2" />
          <span className="block h-9 animate-pulse rounded-control bg-muted/60" />
          <span className="block h-9 animate-pulse rounded-control bg-muted/60" />
        </div>
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
        actions={<Button variant="outline" onClick={() => void reload()}>{t("common.retry")}</Button>}
      />
    );
  }

  const initials = profile.name?.trim().slice(0, 2) || "SF";
  const dirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);
  const setField = (field: keyof Profile, value: string | undefined) =>
    setProfile((current) => ({ ...current, [field]: value }));

  return (
    <section aria-labelledby="settings-profile-title" className="py-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="settings-profile-title" className="text-title-3">
            {t("profile.basicInfo")}
          </h3>
          <p className="mt-0.5 text-body-sm text-muted-foreground">
            {t("profile.basicInfoDesc")}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-surface border border-border bg-card p-4">
        <PhotoUpload
          value={profile.photo ?? null}
          onChange={(url) => setField("photo", url ?? undefined)}
          fallback={initials}
          size={64}
          disabled={!canManage}
          className="flex-1"
        />
        {canManage ? (
          <p className="hidden shrink-0 text-caption text-muted-foreground sm:block">
            {t("profile.photoHint")}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">{t("profile.name")}</Label>
          <Input
            id="name"
            value={profile.name ?? ""}
            readOnly={!canManage}
            onChange={(event) => setField("name", event.target.value)}
            placeholder={t("profile.namePlaceholder")}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("profile.email")}</Label>
          <Input
            id="email"
            type="email"
            value={profile.email ?? ""}
            readOnly={!canManage}
            onChange={(event) => setField("email", event.target.value)}
            placeholder="contact@example.com"
            autoComplete="email"
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("profile.phone")}</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={profile.phone ?? ""}
            readOnly={!canManage}
            onChange={(event) => setField("phone", formatDZPhone(event.target.value))}
            placeholder={DZ_PHONE_PLACEHOLDER}
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="bio">{t("profile.bio")}</Label>
          <Textarea
            id="bio"
            value={profile.bio ?? ""}
            readOnly={!canManage}
            onChange={(event) => setField("bio", event.target.value)}
            placeholder={t("profile.bioPlaceholder")}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      {canManage ? (
        <div className="mt-6 flex items-center justify-end gap-2">
          {dirty ? (
            <p className="me-auto text-caption text-muted-foreground" role="status">
              {t("profile.unsavedChanges")}
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => setProfile(savedProfile)}
          >
            {t("profile.discard")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {t("profile.save")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
