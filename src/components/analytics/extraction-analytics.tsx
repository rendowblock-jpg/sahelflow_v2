"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Zap, CheckCircle2 } from "lucide-react";

interface ExtractionData {
  total: number;
  completionRate: number;
  byMethod: Array<{ method: string; count: number; avgConfidence: number; avgLatencyMs: number }>;
  trend: Array<{ date: string; count: number; avgConfidence: number; completeRate: number }>;
}

export function ExtractionAnalytics() {
  const { t } = useI18n();
  const [data, setData] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/extraction", { headers: { "x-requested-with": "sahelflow" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || !Array.isArray(data.byMethod) || !Array.isArray(data.trend) || data.total === 0) {
    return (
      <div className="app-content page-sections">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('analytics.extraction.empty')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-content page-sections">
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t('analytics.extraction.title')}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.extraction.total')}</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.extraction.completionRate')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(data.completionRate * 100).toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.extraction.methods')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.byMethod.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>{t('analytics.extraction.byMethod')}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.byMethod.map((m) => (
              <div key={m.method} className="flex items-center justify-between">
                <Badge variant={m.method === "gemini" ? "default" : "secondary"}>{m.method}</Badge>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{m.count} extractions</span>
                  <span>{(m.avgConfidence * 100).toFixed(0)}{t('analytics.extraction.avgConfidence')}</span>
                  <span>{Math.round(m.avgLatencyMs)}ms avg</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.trend.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('analytics.extraction.trend')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {data.trend.map((d) => (
                <div key={d.date} className="flex items-center justify-between text-sm py-1">
                  <span className="font-mono text-muted-foreground">{d.date}</span>
                  <div className="flex gap-4">
                    <span>{d.count} extractions</span>
                    <span>{(d.avgConfidence * 100).toFixed(0)}% confidence</span>
                    <span>{(d.completeRate * 100).toFixed(0)}% complete</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
