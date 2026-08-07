"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, TrendingUp, Zap } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-loading";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";

interface ExtractionData { total: number; completionRate: number; byMethod: Array<{ method: string; count: number; avgConfidence: number; avgLatencyMs: number }>; trend: Array<{ date: string; count: number; avgConfidence: number; completeRate: number }>; }
export function ExtractionAnalytics() {
  const { t } = useI18n(); const [data, setData] = useState<ExtractionData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const response = await fetch("/api/analytics/extraction", { headers: { "x-requested-with": "sahelflow" }, cache: "no-store" }); if (!response.ok) throw new Error(t("error.requestFailed")); const next = await response.json() as ExtractionData; setData(next); } catch (caught) { setError(caught instanceof Error ? caught.message : t("error.requestFailed")); } finally { setLoading(false); } }, [t]);
  useEffect(() => { void load(); }, [load]);
  if (loading && !data) return <PageLoading statCount={3} showTable={false} />;
  if (error && !data) return <div className="app-content page-sections"><PageHeader title={t("analytics.extraction.title")} /><StateSurface icon={AlertTriangle} title={t("error.requestFailed")} description={error} tone="danger" actions={<Button variant="outline" onClick={() => void load()}><RefreshCw className="me-2 size-4" />{t("common.retry")}</Button>} /></div>;
  if (!data || !Array.isArray(data.byMethod) || !Array.isArray(data.trend) || data.total === 0) return <div className="app-content page-sections"><PageHeader title={t("analytics.extraction.title")} /><StateSurface icon={Zap} title={t("analytics.extraction.empty")} /></div>;
  return <div className="app-content page-sections"><PageHeader title={t("analytics.extraction.title")} actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="me-2 size-4" />{t("common.refresh")}</Button>} /><div className="card-grid-3"><StatCard label={t("analytics.extraction.total")} value={data.total} icon={<Zap />} /><StatCard label={t("analytics.extraction.completionRate")} value={`${(data.completionRate * 100).toFixed(1)}%`} icon={<CheckCircle2 />} /><StatCard label={t("analytics.extraction.methods")} value={data.byMethod.length} icon={<TrendingUp />} /></div><Card><CardHeader><CardTitle className="text-base">{t("analytics.extraction.byMethod")}</CardTitle></CardHeader><CardContent><div className="space-y-3">{data.byMethod.map((method) => <div key={method.method} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"><Badge variant={method.method === "gemini" ? "default" : "secondary"}>{method.method}</Badge><div className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span className="tabular-nums">{method.count}</span><span className="tabular-nums">{(method.avgConfidence * 100).toFixed(0)}% · {t("analytics.extraction.avgConfidence")}</span><span className="tabular-nums">{Math.round(method.avgLatencyMs)} ms</span></div></div>)}</div></CardContent></Card>{data.trend.length ? <Card><CardHeader><CardTitle className="text-base">{t("analytics.extraction.trend")}</CardTitle></CardHeader><CardContent><div className="max-h-72 space-y-1 overflow-y-auto">{data.trend.map((row) => <div key={row.date} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 py-1.5 text-sm"><span className="font-mono text-muted-foreground">{row.date}</span><span className="tabular-nums">{row.count}</span><span className="tabular-nums">{(row.avgConfidence * 100).toFixed(0)}%</span><span className="tabular-nums">{(row.completeRate * 100).toFixed(0)}%</span></div>)}</div></CardContent></Card> : null}</div>;
}
