"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { StateSurface } from "@/components/shared/state-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { getWhatsAppIngressRecoveryTranslation, type WhatsAppIngressRecoveryKey } from "@/lib/i18n/whatsapp-ingress-recovery";
import { toast } from "@/lib/toast";

interface IngressAttempt { id: string; attemptNumber: number; state: string; errorCode: string | null; startedAt: string; completedAt: string | null; }
interface IngressEvent { id: string; status: string; sourceId: string; providerEventId: string; providerTimestamp: string | null; attemptCount: number; lastErrorCode: string | null; createdAt: string; updatedAt: string; attempts: IngressAttempt[]; }
const RECOVERY_STATES = new Set(["retrying", "quarantined", "dead_letter"]);
function contactFromJid(sourceId: string): string { return sourceId.split("@")[0]?.split(":")[0] ?? sourceId; }

export function WhatsAppIngressRecoveryPanel({ canRecover = false }: { canRecover?: boolean }) {
  const { locale } = useI18n(); const tr = useCallback((key: WhatsAppIngressRecoveryKey) => getWhatsAppIngressRecoveryTranslation(locale, key), [locale]); const [events, setEvents] = useState<IngressEvent[]>([]); const [loading, setLoading] = useState(true); const [authorized, setAuthorized] = useState(true); const [loadError, setLoadError] = useState(false); const [reasons, setReasons] = useState<Record<string, string>>({}); const [retryingId, setRetryingId] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setLoadError(false); try { const response = await fetch("/api/whatsapp/inbound?limit=50", { cache: "no-store" }); if (response.status === 401 || response.status === 403) { setAuthorized(false); return; } if (!response.ok) throw new Error("INGRESS_HISTORY_FAILED"); const data = await response.json() as { events?: IngressEvent[] }; setEvents(Array.isArray(data.events) ? data.events : []); setAuthorized(true); } catch { setLoadError(true); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const recoveryEvents = useMemo(() => events.filter((event) => RECOVERY_STATES.has(event.status)), [events]);
  const retry = async (event: IngressEvent) => { if (!canRecover) return; const reason = (reasons[event.id] ?? "").trim(); if (reason.length < 3) return; setRetryingId(event.id); try { const response = await fetch("/api/whatsapp/inbound/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingressEventId: event.id, reason }) }); if (!response.ok) throw new Error("Retry failed"); toast.success(tr("retryQueued")); setReasons((current) => ({ ...current, [event.id]: "" })); await load(); } catch { toast.error(tr("retryFailed")); } finally { setRetryingId(null); } };
  if (!authorized) return null;
  if (loadError && events.length === 0) return <StateSurface icon={AlertTriangle} title={tr("title")} description={tr("description")} tone="warning" size="inline" actions={<Button type="button" variant="outline" onClick={() => void load()}><RefreshCw className="me-2 size-4" />{tr("refresh")}</Button>} />;
  return <Card className="border-warning/30" aria-live="polite"><CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle className="flex items-center gap-2 text-base">{recoveryEvents.length > 0 ? <AlertTriangle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />}{tr("title")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{tr("description")}</p></div><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="me-1.5 size-3.5 animate-spin" /> : <RefreshCw className="me-1.5 size-3.5" />}{tr("refresh")}</Button></CardHeader><CardContent>{loading && events.length === 0 ? <p className="text-sm text-muted-foreground">{tr("processing")}</p> : recoveryEvents.length === 0 ? <p className="text-sm text-muted-foreground">{tr("noIssues")}</p> : <div className="space-y-3">{recoveryEvents.map((event) => <section key={event.id} className="rounded-md border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong dir="ltr" className="font-mono text-sm">{contactFromJid(event.sourceId) || tr("unknownContact")}</strong><Badge variant={event.status === "dead_letter" ? "destructive" : "outline"}>{tr(event.status as WhatsAppIngressRecoveryKey)}</Badge></div>{event.lastErrorCode ? <p className="mt-1 text-xs text-destructive" dir="ltr">{event.lastErrorCode}</p> : null}{canRecover ? <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div><Label htmlFor={`retry-${event.id}`}>{tr("retryReason")}</Label><Input id={`retry-${event.id}`} className="mt-1" value={reasons[event.id] ?? ""} onChange={(input) => setReasons((current) => ({ ...current, [event.id]: input.target.value }))} maxLength={500} /></div><Button type="button" disabled={retryingId === event.id || (reasons[event.id] ?? "").trim().length < 3} onClick={() => void retry(event)}><RotateCcw className="me-1.5 size-4" />{tr("retry")}</Button></div> : null}</section>)}</div>}</CardContent></Card>;
}
