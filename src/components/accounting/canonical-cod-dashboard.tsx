"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Scale,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD, formatDate } from "@/lib/utils";

interface CodPosition {
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  customerName: string;
  collectionId: string | null;
  provider: string | null;
  codState: string;
  expectedReceivable: number;
  effectiveCollected: number;
  grossRemitted: number;
  fees: number;
  adjustments: number;
  netReceived: number;
  discrepancy: number;
  outstandingCollection: number;
  outstandingRemittance: number;
  collectionReference: string | null;
  collectedAt: string | null;
  lastSettlementReference: string | null;
  lastSettlementAt: string | null;
}

interface SettlementSummary {
  settlementId: string;
  provider: string;
  externalReference: string;
  status: "posted" | "needs_review";
  receivedAt: string;
  grossAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  discrepancyAmount: number;
  unmatchedAmount: number;
  lineCount: number;
}

interface ReviewLine {
  lineId: string;
  settlementId: string;
  provider: string;
  externalReference: string;
  receivedAt: string;
  providerLineReference: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderVersion: number | null;
  unresolvedUnmatched: boolean;
  effectiveGross: number;
  effectiveFee: number;
  effectiveAdjustment: number;
  effectiveNet: number;
  effectiveDiscrepancy: number;
}

export interface CanonicalCodDashboardSummary {
  totals: {
    expectedReceivable: number;
    effectiveCollected: number;
    grossRemitted: number;
    fees: number;
    adjustments: number;
    netReceived: number;
    discrepancy: number;
    unmatched: number;
    outstandingCollection: number;
    outstandingRemittance: number;
  };
  counts: {
    receivable: number;
    awaitingCollection: number;
    awaitingRemittance: number;
    disputed: number;
    remitted: number;
    settlementsNeedingReview: number;
  };
  awaitingCollection: CodPosition[];
  awaitingRemittance: CodPosition[];
  disputed: CodPosition[];
  recentSettlements: SettlementSummary[];
  reviewLines: ReviewLine[];
}

interface SettlementDraft {
  selected: boolean;
  gross: string;
  fee: string;
  adjustment: string;
  isFinal: boolean;
}

interface BatchLinePayload {
  providerLineReference?: string;
  orderId?: string;
  expectedVersion?: number;
  grossRemittedAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  isFinal: boolean;
}

function localDateTime(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function integer(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function stableKey(storageKey: string): string {
  const existing = window.localStorage.getItem(storageKey);
  if (existing && existing.length >= 8) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  locale,
  count = false,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  locale: string;
  count?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold tabular-nums">
            {count ? value : formatDZD(value, locale)}
          </p>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export function CanonicalCodDashboard({
  summary,
}: {
  summary: CanonicalCodDashboardSummary;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [collections, setCollections] = useState<Record<string, {
    amount: string;
    provider: string;
    reference: string;
    at: string;
  }>>({});
  const [collectionCorrections, setCollectionCorrections] = useState<Record<string, {
    delta: string;
    reason: string;
    at: string;
  }>>({});
  const [settlementLines, setSettlementLines] = useState<Record<string, SettlementDraft>>({});
  const [batch, setBatch] = useState({
    provider: "",
    reference: "",
    receivedAt: localDateTime(),
    evidenceName: "",
    evidenceHash: "",
    includeUnmatched: false,
    unmatchedReference: "",
    unmatchedGross: "",
    unmatchedFee: "0",
    unmatchedAdjustment: "0",
  });
  const [review, setReview] = useState<Record<string, {
    orderId: string;
    reason: string;
    at: string;
    grossDelta: string;
    feeDelta: string;
    adjustmentDelta: string;
    discrepancyDelta: string;
  }>>({});

  function settlementDraft(item: CodPosition): SettlementDraft {
    return settlementLines[item.orderId] ?? {
      selected: false,
      gross: String(item.outstandingRemittance),
      fee: "0",
      adjustment: "0",
      isFinal: true,
    };
  }

  const selected = useMemo(
    () => summary.awaitingRemittance.filter((item) => settlementDraft(item).selected),
    [settlementLines, summary.awaitingRemittance],
  );
  const selectedProvider = selected[0]?.provider ?? null;
  const activeProvider = selectedProvider ?? (batch.provider.trim() || null);
  const selectedGross = selected.reduce(
    (total, item) => total + integer(settlementDraft(item).gross),
    0,
  );
  const matchCandidates = useMemo(() => {
    const seen = new Set<string>();
    return [...summary.awaitingRemittance, ...summary.disputed].filter((item) => {
      if (item.outstandingRemittance <= 0 || seen.has(item.orderId)) return false;
      seen.add(item.orderId);
      return true;
    });
  }, [summary.awaitingRemittance, summary.disputed]);

  function collectionDraft(item: CodPosition) {
    return collections[item.orderId] ?? {
      amount: String(item.expectedReceivable),
      provider: item.provider ?? "manual-courier",
      reference: "",
      at: localDateTime(),
    };
  }

  function collectionCorrectionDraft(item: CodPosition) {
    return collectionCorrections[item.orderId] ?? {
      delta: String(-item.discrepancy),
      reason: "provider-statement-corrected",
      at: localDateTime(),
    };
  }

  function reviewDraft(line: ReviewLine) {
    return review[line.lineId] ?? {
      orderId: "",
      reason: line.unresolvedUnmatched
        ? "provider-reference-reconciled"
        : "provider-statement-corrected",
      at: localDateTime(),
      grossDelta: "0",
      feeDelta: "0",
      adjustmentDelta: "0",
      discrepancyDelta: String(-line.effectiveDiscrepancy),
    };
  }

  async function commit(
    operationKey: string,
    url: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    setBusy(operationKey);
    setError(null);
    setNotice(null);
    const storageKey = `sf-canonical-cod:${operationKey}`;
    const idempotencyKey = stableKey(storageKey);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          idempotencyKey,
          correlationId: `canonical-cod-ui:${idempotencyKey}`,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        command?: { replayed?: boolean };
      };
      if (!response.ok) {
        const message =
          payload.code === "CONFLICT"
            ? t("codReconciliation.conflict")
            : payload.code === "VALIDATION_ERROR"
              ? t("codReconciliation.invalid")
              : payload.error || t("codReconciliation.failed");
        throw new Error(message);
      }
      window.localStorage.removeItem(storageKey);
      setNotice(payload.command?.replayed ? t("codReconciliation.replayed") : t("codReconciliation.commitSuccess"));
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("codReconciliation.failed"));
      return false;
    } finally {
      setBusy("");
    }
  }

  function toggleOrder(item: CodPosition, checked: boolean): void {
    if (checked && selectedProvider && item.provider !== selectedProvider) {
      setError(t("codReconciliation.mixedProvider"));
      return;
    }
    setError(null);
    const draft = settlementDraft(item);
    setSettlementLines((current) => ({
      ...current,
      [item.orderId]: { ...draft, selected: checked },
    }));
  }

  async function postBatch(): Promise<void> {
    const unmatchedGross = integer(batch.unmatchedGross);
    const lines: BatchLinePayload[] = selected.map((item) => {
      const draft = settlementDraft(item);
      return {
        orderId: item.orderId,
        expectedVersion: item.orderVersion,
        providerLineReference: `${batch.reference.trim()}:${item.orderNumber}`,
        grossRemittedAmount: integer(draft.gross),
        feeAmount: integer(draft.fee),
        adjustmentAmount: integer(draft.adjustment),
        isFinal: draft.isFinal,
      };
    });
    if (batch.includeUnmatched && unmatchedGross > 0) {
      lines.push({
        providerLineReference: batch.unmatchedReference.trim() || undefined,
        grossRemittedAmount: unmatchedGross,
        feeAmount: integer(batch.unmatchedFee),
        adjustmentAmount: integer(batch.unmatchedAdjustment),
        isFinal: true,
      });
    }
    if (!activeProvider || !batch.reference.trim() || lines.length === 0) {
      setError(t("codReconciliation.invalid"));
      return;
    }
    const succeeded = await commit(
      `settlement:${activeProvider}:${batch.reference.trim()}`,
      "/api/accounting/cod-settlements",
      {
        provider: activeProvider,
        externalReference: batch.reference.trim(),
        receivedAt: new Date(batch.receivedAt).toISOString(),
        evidenceName: batch.evidenceName.trim() || undefined,
        evidenceSha256: batch.evidenceHash.trim() || undefined,
        lines,
      },
    );
    if (succeeded) {
      setSettlementLines({});
      setBatch((current) => ({
        ...current,
        reference: "",
        evidenceName: "",
        evidenceHash: "",
        includeUnmatched: false,
        unmatchedReference: "",
        unmatchedGross: "",
        unmatchedFee: "0",
        unmatchedAdjustment: "0",
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="outline" className="gap-1.5">
          <Scale className="h-3.5 w-3.5" />
          {t("codReconciliation.authority")}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCcw className="me-1.5 h-4 w-4" />
          {t("codReconciliation.refresh")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t("codReconciliation.expected")} value={summary.totals.expectedReceivable} icon={CircleDollarSign} locale={locale} />
        <SummaryCard label={t("codReconciliation.collectedTotal")} value={summary.totals.effectiveCollected} icon={CheckCircle2} locale={locale} />
        <SummaryCard label={t("codReconciliation.grossRemitted")} value={summary.totals.grossRemitted} icon={ReceiptText} locale={locale} />
        <SummaryCard label={t("codReconciliation.net")} value={summary.totals.netReceived} icon={Scale} locale={locale} />
        <SummaryCard label={t("codReconciliation.fees")} value={summary.totals.fees} icon={ReceiptText} locale={locale} />
        <SummaryCard label={t("codReconciliation.collectPending")} value={summary.totals.outstandingCollection} icon={Clock3} locale={locale} />
        <SummaryCard label={t("codReconciliation.remitPending")} value={summary.totals.outstandingRemittance} icon={Clock3} locale={locale} />
        <SummaryCard label={t("codReconciliation.reviewCount")} value={summary.reviewLines.length + summary.disputed.length} icon={AlertTriangle} locale={locale} count />
      </div>

      {notice ? (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("codReconciliation.collectionTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("codReconciliation.collectionHelp")}</p>
        </CardHeader>
        <CardContent>
          {summary.awaitingCollection.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t("codReconciliation.noCollection")} />
          ) : (
            <div className="space-y-4">
              {summary.awaitingCollection.map((item) => {
                const draft = collectionDraft(item);
                const operationKey = `collection:${item.orderId}:${item.orderVersion}`;
                const amountId = `cod-collection-amount-${item.orderId}`;
                const providerId = `cod-collection-provider-${item.orderId}`;
                const referenceId = `cod-collection-reference-${item.orderId}`;
                const dateId = `cod-collection-date-${item.orderId}`;
                return (
                  <div key={item.orderId} className="rounded-lg border p-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold">{item.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">{item.customerName}</p>
                      </div>
                      <p className="text-sm">{t("codReconciliation.expectedAmount")}: <strong>{formatDZD(item.expectedReceivable, locale)}</strong></p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5"><Label htmlFor={amountId}>{t("codReconciliation.amount")}</Label><Input id={amountId} inputMode="numeric" value={draft.amount} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, amount: event.target.value } }))} /></div>
                      <div className="space-y-1.5"><Label htmlFor={providerId}>{t("codReconciliation.provider")}</Label><Input id={providerId} dir="auto" value={draft.provider} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, provider: event.target.value } }))} /></div>
                      <div className="space-y-1.5"><Label htmlFor={referenceId}>{t("codReconciliation.reference")}</Label><Input id={referenceId} dir="auto" value={draft.reference} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, reference: event.target.value } }))} /></div>
                      <div className="space-y-1.5"><Label htmlFor={dateId}>{t("codReconciliation.date")}</Label><Input id={dateId} type="datetime-local" value={draft.at} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, at: event.target.value } }))} /></div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button disabled={Boolean(busy) || integer(draft.amount) <= 0 || !draft.provider.trim()} onClick={() => void commit(operationKey, `/api/orders/${item.orderId}/cod/collection`, { expectedVersion: item.orderVersion, amount: integer(draft.amount), provider: draft.provider.trim(), reference: draft.reference.trim() || undefined, collectedAt: new Date(draft.at).toISOString() })}>
                        {busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                        {t("codReconciliation.collect")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("codReconciliation.settlementTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("codReconciliation.settlementHelp")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.awaitingRemittance.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t("codReconciliation.noRemittance")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start">{t("codReconciliation.select")}</th>
                    <th className="p-3 text-start">{t("codReconciliation.order")}</th>
                    <th className="p-3 text-start">{t("codReconciliation.provider")}</th>
                    <th className="p-3 text-end">{t("codReconciliation.outstanding")}</th>
                    <th className="p-3 text-end">{t("codReconciliation.gross")}</th>
                    <th className="p-3 text-end">{t("codReconciliation.fees")}</th>
                    <th className="p-3 text-end">{t("codReconciliation.adjustment")}</th>
                    <th className="p-3 text-center">{t("codReconciliation.final")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.awaitingRemittance.map((item) => {
                    const draft = settlementDraft(item);
                    return (
                      <tr key={item.orderId} className={draft.selected ? "bg-primary/5" : undefined}>
                        <td className="p-3"><Checkbox checked={draft.selected} onCheckedChange={(value) => toggleOrder(item, value === true)} aria-label={`${t("codReconciliation.select")} ${item.orderNumber}`} /></td>
                        <td className="p-3"><p className="font-mono font-medium">{item.orderNumber}</p><p className="text-xs text-muted-foreground">{item.customerName}</p></td>
                        <td className="p-3" dir="auto">{item.provider}</td>
                        <td className="p-3 text-end tabular-nums">{formatDZD(item.outstandingRemittance, locale)}</td>
                        <td className="p-3"><Input className="min-w-28 text-end" inputMode="numeric" disabled={!draft.selected} aria-label={`${t("codReconciliation.gross")} ${item.orderNumber}`} value={draft.gross} onChange={(event) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, gross: event.target.value } }))} /></td>
                        <td className="p-3"><Input className="min-w-24 text-end" inputMode="numeric" disabled={!draft.selected} aria-label={`${t("codReconciliation.fees")} ${item.orderNumber}`} value={draft.fee} onChange={(event) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, fee: event.target.value } }))} /></td>
                        <td className="p-3"><Input className="min-w-24 text-end" inputMode="numeric" disabled={!draft.selected} aria-label={`${t("codReconciliation.adjustment")} ${item.orderNumber}`} value={draft.adjustment} onChange={(event) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, adjustment: event.target.value } }))} /></td>
                        <td className="p-3 text-center"><Checkbox disabled={!draft.selected} checked={draft.isFinal} onCheckedChange={(value) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, isFinal: value === true } }))} aria-label={`${t("codReconciliation.final")} ${item.orderNumber}`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor="cod-batch-provider">{t("codReconciliation.provider")}</Label><Input id="cod-batch-provider" dir="auto" disabled={Boolean(selectedProvider)} value={selectedProvider ?? batch.provider} onChange={(event) => setBatch((current) => ({ ...current, provider: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="cod-batch-reference">{t("codReconciliation.batchReference")}</Label><Input id="cod-batch-reference" dir="auto" value={batch.reference} onChange={(event) => setBatch((current) => ({ ...current, reference: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="cod-batch-date">{t("codReconciliation.date")}</Label><Input id="cod-batch-date" type="datetime-local" value={batch.receivedAt} onChange={(event) => setBatch((current) => ({ ...current, receivedAt: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="cod-batch-evidence-name">{t("codReconciliation.evidenceName")}</Label><Input id="cod-batch-evidence-name" dir="auto" value={batch.evidenceName} onChange={(event) => setBatch((current) => ({ ...current, evidenceName: event.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label htmlFor="cod-batch-evidence-hash">{t("codReconciliation.evidenceHash")}</Label><Input id="cod-batch-evidence-hash" dir="ltr" value={batch.evidenceHash} onChange={(event) => setBatch((current) => ({ ...current, evidenceHash: event.target.value }))} /></div>
              <div className="flex items-end gap-2"><Checkbox checked={batch.includeUnmatched} onCheckedChange={(value) => setBatch((current) => ({ ...current, includeUnmatched: value === true }))} aria-label={t("codReconciliation.addUnmatched")} /><Label>{t("codReconciliation.addUnmatched")}</Label></div>
            </div>

            {batch.includeUnmatched ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5"><Label htmlFor="cod-unmatched-reference">{t("codReconciliation.unmatchedReference")}</Label><Input id="cod-unmatched-reference" dir="auto" value={batch.unmatchedReference} onChange={(event) => setBatch((current) => ({ ...current, unmatchedReference: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="cod-unmatched-gross">{t("codReconciliation.gross")}</Label><Input id="cod-unmatched-gross" inputMode="numeric" value={batch.unmatchedGross} onChange={(event) => setBatch((current) => ({ ...current, unmatchedGross: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="cod-unmatched-fee">{t("codReconciliation.fees")}</Label><Input id="cod-unmatched-fee" inputMode="numeric" value={batch.unmatchedFee} onChange={(event) => setBatch((current) => ({ ...current, unmatchedFee: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="cod-unmatched-adjustment">{t("codReconciliation.adjustment")}</Label><Input id="cod-unmatched-adjustment" inputMode="numeric" value={batch.unmatchedAdjustment} onChange={(event) => setBatch((current) => ({ ...current, unmatchedAdjustment: event.target.value }))} /></div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("codReconciliation.selectedGross")}: <strong className="text-foreground">{formatDZD(selectedGross + (batch.includeUnmatched ? integer(batch.unmatchedGross) : 0), locale)}</strong></p>
              <Button disabled={Boolean(busy) || !activeProvider || !batch.reference.trim() || (selected.length === 0 && integer(batch.unmatchedGross) <= 0)} onClick={() => void postBatch()}>
                {busy.startsWith("settlement:") ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                {t("codReconciliation.postBatch")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("codReconciliation.reviewTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("codReconciliation.reviewHelp")}</p>
        </CardHeader>
        <CardContent>
          {summary.reviewLines.length === 0 && summary.disputed.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t("codReconciliation.noReview")} />
          ) : (
            <div className="space-y-4">
              {summary.reviewLines.map((line) => {
                const draft = reviewDraft(line);
                const matchingOrder = matchCandidates.find((item) => item.orderId === draft.orderId);
                const operationKey = line.unresolvedUnmatched
                  ? `match:${line.lineId}:${matchingOrder?.orderVersion ?? "none"}`
                  : `line-correction:${line.lineId}:${line.orderVersion ?? "unmatched"}`;
                const orderSelectId = `cod-review-order-${line.lineId}`;
                const reasonId = `cod-review-reason-${line.lineId}`;
                return (
                  <div key={line.lineId} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><Badge variant={line.unresolvedUnmatched ? "secondary" : "destructive"}>{line.unresolvedUnmatched ? t("codReconciliation.unmatched") : t("codReconciliation.disputed")}</Badge><p className="mt-2 font-mono text-sm">{line.externalReference}</p><p className="text-xs text-muted-foreground">{line.provider} · {formatDate(line.receivedAt, locale)}</p></div>
                      <div className="text-end text-sm tabular-nums"><p>{t("codReconciliation.gross")}: {formatDZD(line.effectiveGross, locale)}</p><p>{t("codReconciliation.fees")}: {formatDZD(line.effectiveFee, locale)}</p><p className={line.effectiveDiscrepancy === 0 ? "" : "text-destructive"}>{t("codReconciliation.reviewCount")}: {formatDZD(line.effectiveDiscrepancy, locale)}</p></div>
                    </div>

                    {line.unresolvedUnmatched ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                        <div className="space-y-1.5"><Label htmlFor={orderSelectId}>{t("codReconciliation.matchOrder")}</Label><select id={orderSelectId} className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.orderId} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, orderId: event.target.value } }))}><option value="">—</option>{matchCandidates.filter((item) => item.provider === line.provider).map((item) => <option key={item.orderId} value={item.orderId}>{item.orderNumber} · {item.customerName} · {formatDZD(item.outstandingRemittance, locale)}</option>)}</select></div>
                        <div className="space-y-1.5"><Label htmlFor={reasonId}>{t("codReconciliation.reason")}</Label><Input id={reasonId} dir="auto" value={draft.reason} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, reason: event.target.value } }))} /></div>
                        <Button disabled={Boolean(busy) || !matchingOrder || !draft.reason.trim()} onClick={() => matchingOrder && void commit(operationKey, `/api/accounting/cod-settlements/lines/${line.lineId}/match`, { orderId: matchingOrder.orderId, expectedVersion: matchingOrder.orderVersion, reasonCode: draft.reason.trim(), occurredAt: new Date(draft.at).toISOString() })}>{busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{t("codReconciliation.match")}</Button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          <div className="space-y-1.5"><Label htmlFor={`cod-gross-delta-${line.lineId}`}>{t("codReconciliation.grossDelta")}</Label><Input id={`cod-gross-delta-${line.lineId}`} inputMode="numeric" value={draft.grossDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, grossDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`cod-fee-delta-${line.lineId}`}>{t("codReconciliation.feeDelta")}</Label><Input id={`cod-fee-delta-${line.lineId}`} inputMode="numeric" value={draft.feeDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, feeDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`cod-adjustment-delta-${line.lineId}`}>{t("codReconciliation.adjustmentDelta")}</Label><Input id={`cod-adjustment-delta-${line.lineId}`} inputMode="numeric" value={draft.adjustmentDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, adjustmentDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`cod-discrepancy-delta-${line.lineId}`}>{t("codReconciliation.discrepancyDelta")}</Label><Input id={`cod-discrepancy-delta-${line.lineId}`} inputMode="numeric" value={draft.discrepancyDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, discrepancyDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label htmlFor={reasonId}>{t("codReconciliation.reason")}</Label><Input id={reasonId} dir="auto" value={draft.reason} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, reason: event.target.value } }))} /></div>
                        </div>
                        <div className="flex justify-end"><Button disabled={Boolean(busy) || !draft.reason.trim()} onClick={() => void commit(operationKey, `/api/accounting/cod-settlements/lines/${line.lineId}/correction`, { expectedVersion: line.orderVersion ?? undefined, grossDelta: integer(draft.grossDelta), feeDelta: integer(draft.feeDelta), adjustmentDelta: integer(draft.adjustmentDelta), discrepancyDelta: integer(draft.discrepancyDelta), reasonCode: draft.reason.trim(), occurredAt: new Date(draft.at).toISOString() })}>{busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{t("codReconciliation.correction")}</Button></div>
                      </div>
                    )}
                  </div>
                );
              })}

              {summary.disputed.filter((item) => item.collectionId && item.discrepancy !== 0).map((item) => {
                const draft = collectionCorrectionDraft(item);
                const operationKey = `collection-correction:${item.orderId}:${item.orderVersion}`;
                const deltaId = `cod-collection-delta-${item.orderId}`;
                const reasonId = `cod-collection-reason-${item.orderId}`;
                return (
                  <div key={operationKey} className="rounded-lg border border-warning/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><Badge variant="outline">{t("codReconciliation.collectionCorrection")}</Badge><p className="mt-2 font-mono text-sm font-semibold">{item.orderNumber}</p><p className="text-sm text-muted-foreground">{item.customerName}</p></div><div className="text-end text-sm"><p>{t("codReconciliation.expectedAmount")}: {formatDZD(item.expectedReceivable, locale)}</p><p>{t("codReconciliation.collectedTotal")}: {formatDZD(item.effectiveCollected, locale)}</p><p className="text-destructive">{t("codReconciliation.reviewCount")}: {formatDZD(item.discrepancy, locale)}</p></div></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end"><div className="space-y-1.5"><Label htmlFor={deltaId}>{t("codReconciliation.collectionDelta")}</Label><Input id={deltaId} inputMode="numeric" value={draft.delta} onChange={(event) => setCollectionCorrections((current) => ({ ...current, [item.orderId]: { ...draft, delta: event.target.value } }))} /></div><div className="space-y-1.5"><Label htmlFor={reasonId}>{t("codReconciliation.reason")}</Label><Input id={reasonId} dir="auto" value={draft.reason} onChange={(event) => setCollectionCorrections((current) => ({ ...current, [item.orderId]: { ...draft, reason: event.target.value } }))} /></div><Button disabled={Boolean(busy) || integer(draft.delta) === 0 || !draft.reason.trim()} onClick={() => void commit(operationKey, `/api/orders/${item.orderId}/cod/collection/correction`, { expectedVersion: item.orderVersion, amountDelta: integer(draft.delta), reasonCode: draft.reason.trim(), occurredAt: new Date(draft.at).toISOString() })}>{busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{t("codReconciliation.correction")}</Button></div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("codReconciliation.recentTitle")}</CardTitle></CardHeader>
        <CardContent>
          {summary.recentSettlements.length === 0 ? (
            <EmptyState icon={ReceiptText} title={t("codReconciliation.noRecent")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/60 text-muted-foreground"><tr><th className="p-3 text-start">{t("codReconciliation.reference")}</th><th className="p-3 text-start">{t("codReconciliation.provider")}</th><th className="p-3 text-start">{t("codReconciliation.state")}</th><th className="p-3 text-end">{t("codReconciliation.gross")}</th><th className="p-3 text-end">{t("codReconciliation.fees")}</th><th className="p-3 text-end">{t("codReconciliation.net")}</th><th className="p-3 text-end">{t("codReconciliation.reviewCount")}</th></tr></thead>
                <tbody className="divide-y">{summary.recentSettlements.map((item) => <tr key={item.settlementId}><td className="p-3"><p className="font-mono font-medium">{item.externalReference}</p><p className="text-xs text-muted-foreground">{formatDate(item.receivedAt, locale)} · {item.lineCount} {t("codReconciliation.lines")}</p></td><td className="p-3" dir="auto">{item.provider}</td><td className="p-3"><Badge variant={item.status === "posted" ? "outline" : "destructive"}>{item.status === "posted" ? t("codReconciliation.posted") : t("codReconciliation.needsReview")}</Badge></td><td className="p-3 text-end tabular-nums">{formatDZD(item.grossAmount, locale)}</td><td className="p-3 text-end tabular-nums">{formatDZD(item.feeAmount, locale)}</td><td className="p-3 text-end tabular-nums">{formatDZD(item.netAmount, locale)}</td><td className="p-3 text-end tabular-nums">{formatDZD(item.discrepancyAmount + item.unmatchedAmount, locale)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
