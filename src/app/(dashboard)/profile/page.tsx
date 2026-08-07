"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Save, User } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { FormLoading } from "@/components/shared/page-loading";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface Profile { name?: string; email?: string; phone?: string; photo?: string; bio?: string; }

export default function ProfilePage() {
  const { t } = useI18n(); const [profile, setProfile] = useState<Profile>({}); const [baseline, setBaseline] = useState("{}"); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setLoadError(null); try { const response = await fetch("/api/profile", { cache: "no-store" }); const data = await response.json().catch(() => ({})) as Profile & { error?: string }; if (!response.ok) throw new Error(data.error ?? t("error.requestFailed")); const next = { name: data.name, email: data.email, phone: data.phone, photo: data.photo, bio: data.bio }; setProfile(next); setBaseline(JSON.stringify(next)); } catch (error) { setLoadError(error instanceof Error ? error.message : t("error.requestFailed")); } finally { setLoading(false); } }, [t]);
  useEffect(() => { void load(); }, [load]);
  const dirty = useMemo(() => JSON.stringify(profile) !== baseline, [baseline, profile]);
  const handleSave = useCallback(async () => { if (!dirty) return; setSaving(true); try { const res = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) }); const data = await res.json().catch(() => ({})) as { error?: string }; if (!res.ok) throw new Error(data.error ?? t("profile.saveFailed")); setBaseline(JSON.stringify(profile)); toast.success(t("profile.saved")); } catch (error) { toast.error(error instanceof Error ? error.message : t("profile.saveFailed")); } finally { setSaving(false); } }, [dirty, profile, t]);
  if (loading) return <FormLoading />;
  if (loadError) return <div className="app-content page-sections"><PageHeader title={t("profile.title")} description={t("profile.description")} /><StateSurface icon={AlertTriangle} title={t("error.requestFailed")} description={loadError} tone="danger" actions={<Button type="button" variant="outline" onClick={() => void load()}><RefreshCw className="me-2 size-4" />{t("common.retry")}</Button>} /></div>;
  const initials = profile.name?.slice(0, 2) ?? "SF";
  return <div className="app-content page-sections"><PageHeader title={t("profile.title")} description={t("profile.description")} /><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="size-5 text-muted-foreground" />{t("profile.basicInfo")}</CardTitle><CardDescription>{t("profile.basicInfoDesc")}</CardDescription></CardHeader><CardContent className="space-y-6"><PhotoUpload value={profile.photo ?? null} onChange={(url) => setProfile((current) => ({ ...current, photo: url ?? undefined }))} fallback={initials} size={96} /><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">{t("profile.name")}</Label><Input id="name" value={profile.name ?? ""} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="email">{t("profile.email")}</Label><Input id="email" type="email" dir="ltr" value={profile.email ?? ""} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="phone">{t("profile.phone")}</Label><Input id="phone" dir="ltr" value={profile.phone ?? ""} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></div></div><div className="space-y-2"><Label htmlFor="bio">{t("profile.bio")}</Label><Textarea id="bio" rows={3} value={profile.bio ?? ""} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} /></div><div className="flex justify-end"><Button onClick={() => void handleSave()} disabled={saving || !dirty}><Save className="me-2 size-4" />{t("profile.save")}</Button></div></CardContent></Card></div>;
}
