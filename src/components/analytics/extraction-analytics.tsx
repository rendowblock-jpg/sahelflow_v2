"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, TrendingUp, Zap } from "lucide-react";

import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";

interface ExtractionData {
  total: number;
  completionRate: number;
  byMethod: Array<{
    method: string;
    count: number;
    avgConfidence: number;
    avgLatencyMs: number;
  }>;
  trend: Array<{
    date: string;
    count: number;
    avgConfidence: number;
    completeRate: number;
  }>;
}

export function ExtractionAnalytics() {
  const { t } = useI18n();
  const [data, setData] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch("/api/analytics/extraction", {
      headers: { "x-requested-with": "sahelflow" },
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? t("error.requestFailed"));
        }
        return response.json() as Promise<ExtractionData>;
      })
      .then(setData)
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : t("error.requestFailed"));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("common.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <StateSurface
        title={t("error.requestFailed")}
        description={error}
        tone="danger"
        size="inline"
        role="alert"
      />
    );
  }
  if (!data || !Array.isArray(data.byMethod) || !Array.isArray(data.trend) || data.total === 0) {
    return (
      <StateSurface
        title={t("analytics.extraction.empty")}
        tone="neutral"
        size="panel"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="card-grid-3">
        <StatCard label={t("analytics.extraction.total")} value={data.total} icon={<Zap />} />
        <StatCard label={t("analytics.extraction.completionRate")} value={`${(data.completionRate * 100).toFixed(1)}%`} icon={<CheckCircle2 />} />
        <StatCard label={t("analytics.extraction.methods")} value={data.byMethod.length} icon={<TrendingUp />} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("analytics.extraction.byMethod")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("analytics.extraction.methods")}</TableHead>
                <TableHead className="text-end">{t("analytics.extraction.total")}</TableHead>
                <TableHead className="text-end">{t("analytics.extraction.avgConfidence")}</TableHead>
                <TableHead className="text-end">ms</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byMethod.map((method) => (
                <TableRow key={method.method}>
                  <TableCell className="font-medium">{method.method}</TableCell>
                  <TableCell className="text-end tabular-nums">{method.count}</TableCell>
                  <TableCell className="text-end tabular-nums">{(method.avgConfidence * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-end tabular-nums">{Math.round(method.avgLatencyMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("analytics.extraction.trend")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead className="text-end">{t("analytics.extraction.total")}</TableHead>
                <TableHead className="text-end">{t("analytics.extraction.avgConfidence")}</TableHead>
                <TableHead className="text-end">{t("analytics.extraction.completionRate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trend.map((day) => (
                <TableRow key={day.date}>
                  <TableCell className="font-mono text-muted-foreground">{day.date}</TableCell>
                  <TableCell className="text-end tabular-nums">{day.count}</TableCell>
                  <TableCell className="text-end tabular-nums">{(day.avgConfidence * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-end tabular-nums">{(day.completeRate * 100).toFixed(0)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
