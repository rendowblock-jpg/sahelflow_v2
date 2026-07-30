"use client";

import { useMemo, useState } from "react";
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

const TEXT = {
  en: {
    authority: "Governed financial authority",
    refresh: "Refresh",
    expected: "Expected receivable",
    collected: "Collected",
    remitted: "Gross remitted",
    fees: "Courier fees",
    net: "Net received",
    collectPending: "Awaiting collection",
    remitPending: "Awaiting remittance",
    reviewCount: "Review queue",
    collectionTitle: "Record courier collection",
    collectionHelp: "The expected amount comes from the immutable delivered receivable ledger.",
    noCollection: "No canonical delivered order is awaiting an initial collection.",
    settlementTitle: "Post a remittance batch",
    settlementHelp: "One batch can contain matched orders from one courier plus an optional unmatched provider line.",
    noRemittance: "No collected order is awaiting remittance.",
    reviewTitle: "Reconcile discrepancies and unmatched lines",
    reviewHelp: "Matching and corrections append new facts; existing financial records are never edited.",
    noReview: "No COD line currently needs reconciliation.",
    recentTitle: "Recent remittance batches",
    noRecent: "No canonical remittance batch has been posted.",
    order: "Order",
    customer: "Customer",
    provider: "Courier / provider",
    amount: "Amount",
    expectedAmount: "Expected",
    outstanding: "Outstanding",
    reference: "Reference",
    date: "Date",
    collect: "Record collection",
    select: "Select",
    gross: "Gross",
    adjustment: "Adjustment",
    final: "Final",
    batchReference: "Batch reference",
    evidenceName: "Evidence name (optional)",
    evidenceHash: "Evidence SHA-256 (optional)",
    addUnmatched: "Include unmatched provider line",
    unmatchedReference: "Provider line reference",
    postBatch: "Post batch",
    selectedGross: "Selected gross",
    unmatched: "Unmatched",
    disputed: "Disputed",
    matchOrder: "Match to order",
    reason: "Reason code",
    match: "Append match",
    correction: "Append correction",
    grossDelta: "Gross delta",
    feeDelta: "Fee delta",
    adjustmentDelta: "Adjustment delta",
    discrepancyDelta: "Discrepancy delta",
    collectionCorrection: "Correct collection",
    collectionDelta: "Collection delta",
    state: "State",
    posted: "Posted",
    needsReview: "Needs review",
    lines: "lines",
    success: "The governed COD command was committed.",
    replayed: "The already committed command was recovered safely.",
    failed: "The command was not committed. Refresh and retry.",
    conflict: "The order or settlement changed. Refresh before retrying.",
    invalid: "Review the required values and integer DZD amounts.",
    mixedProvider: "Select orders from one courier only.",
  },
  fr: {
    authority: "Autorité financière gouvernée",
    refresh: "Actualiser",
    expected: "Créance attendue",
    collected: "Encaissé",
    remitted: "Versement brut",
    fees: "Frais transporteur",
    net: "Net reçu",
    collectPending: "À encaisser",
    remitPending: "À verser",
    reviewCount: "File de contrôle",
    collectionTitle: "Enregistrer l'encaissement transporteur",
    collectionHelp: "Le montant attendu provient du grand livre immuable de la livraison.",
    noCollection: "Aucune commande canonique livrée n'attend un premier encaissement.",
    settlementTitle: "Enregistrer un lot de versement",
    settlementHelp: "Un lot peut contenir les commandes d'un transporteur et une ligne fournisseur non rapprochée facultative.",
    noRemittance: "Aucune commande encaissée n'attend un versement.",
    reviewTitle: "Rapprocher les écarts et lignes non associées",
    reviewHelp: "Les rapprochements et corrections ajoutent des faits; les écritures existantes ne sont jamais modifiées.",
    noReview: "Aucune ligne COD ne nécessite de rapprochement.",
    recentTitle: "Lots de versement récents",
    noRecent: "Aucun lot canonique n'a été enregistré.",
    order: "Commande",
    customer: "Client",
    provider: "Transporteur / fournisseur",
    amount: "Montant",
    expectedAmount: "Attendu",
    outstanding: "Restant",
    reference: "Référence",
    date: "Date",
    collect: "Enregistrer l'encaissement",
    select: "Sélectionner",
    gross: "Brut",
    adjustment: "Ajustement",
    final: "Final",
    batchReference: "Référence du lot",
    evidenceName: "Nom de la preuve (facultatif)",
    evidenceHash: "SHA-256 de la preuve (facultatif)",
    addUnmatched: "Inclure une ligne fournisseur non rapprochée",
    unmatchedReference: "Référence de ligne fournisseur",
    postBatch: "Enregistrer le lot",
    selectedGross: "Brut sélectionné",
    unmatched: "Non rapprochée",
    disputed: "En litige",
    matchOrder: "Rattacher à une commande",
    reason: "Code motif",
    match: "Ajouter le rapprochement",
    correction: "Ajouter la correction",
    grossDelta: "Delta brut",
    feeDelta: "Delta frais",
    adjustmentDelta: "Delta ajustement",
    discrepancyDelta: "Delta écart",
    collectionCorrection: "Corriger l'encaissement",
    collectionDelta: "Delta d'encaissement",
    state: "État",
    posted: "Enregistré",
    needsReview: "À vérifier",
    lines: "lignes",
    success: "La commande COD gouvernée a été validée.",
    replayed: "La commande déjà validée a été récupérée en sécurité.",
    failed: "La commande n'a pas été validée. Actualisez puis réessayez.",
    conflict: "La commande ou le règlement a changé. Actualisez avant de réessayer.",
    invalid: "Vérifiez les valeurs requises et les montants DZD entiers.",
    mixedProvider: "Sélectionnez les commandes d'un seul transporteur.",
  },
  ar: {
    authority: "صلاحية مالية محكومة",
    refresh: "تحديث",
    expected: "المستحق المتوقع",
    collected: "المحصّل",
    remitted: "التحويل الإجمالي",
    fees: "رسوم شركة التوصيل",
    net: "الصافي المستلم",
    collectPending: "بانتظار التحصيل",
    remitPending: "بانتظار التحويل",
    reviewCount: "قائمة المراجعة",
    collectionTitle: "تسجيل تحصيل شركة التوصيل",
    collectionHelp: "يأتي المبلغ المتوقع من سجل مستحق التسليم الثابت.",
    noCollection: "لا توجد طلبية موثوقة مسلّمة بانتظار التحصيل الأول.",
    settlementTitle: "تسجيل دفعة تحويل",
    settlementHelp: "يمكن أن تحتوي الدفعة على طلبيات شركة واحدة وسطر مزوّد غير مطابق اختياري.",
    noRemittance: "لا توجد طلبية محصّلة بانتظار التحويل.",
    reviewTitle: "مطابقة الفروقات والأسطر غير المرتبطة",
    reviewHelp: "تضيف المطابقة والتصحيحات حقائق جديدة ولا تعدّل القيود المالية السابقة.",
    noReview: "لا يوجد سطر دفع عند الاستلام يحتاج إلى مطابقة.",
    recentTitle: "دفعات التحويل الأخيرة",
    noRecent: "لم تُسجّل أي دفعة تحويل موثوقة.",
    order: "الطلبية",
    customer: "الزبون",
    provider: "شركة التوصيل / المزوّد",
    amount: "المبلغ",
    expectedAmount: "المتوقع",
    outstanding: "المتبقي",
    reference: "المرجع",
    date: "التاريخ",
    collect: "تسجيل التحصيل",
    select: "اختيار",
    gross: "الإجمالي",
    adjustment: "التعديل",
    final: "نهائي",
    batchReference: "مرجع الدفعة",
    evidenceName: "اسم الدليل (اختياري)",
    evidenceHash: "بصمة SHA-256 للدليل (اختياري)",
    addUnmatched: "إضافة سطر مزوّد غير مطابق",
    unmatchedReference: "مرجع سطر المزوّد",
    postBatch: "اعتماد الدفعة",
    selectedGross: "الإجمالي المختار",
    unmatched: "غير مطابق",
    disputed: "متنازع عليه",
    matchOrder: "ربطه بطلبية",
    reason: "رمز السبب",
    match: "إضافة المطابقة",
    correction: "إضافة التصحيح",
    grossDelta: "فرق الإجمالي",
    feeDelta: "فرق الرسوم",
    adjustmentDelta: "فرق التعديل",
    discrepancyDelta: "فرق المطابقة",
    collectionCorrection: "تصحيح التحصيل",
    collectionDelta: "فرق التحصيل",
    state: "الحالة",
    posted: "معتمدة",
    needsReview: "بحاجة إلى مراجعة",
    lines: "أسطر",
    success: "تم اعتماد أمر الدفع عند الاستلام الموثوق.",
    replayed: "تمت استعادة الأمر المعتمد سابقًا بأمان.",
    failed: "لم يتم اعتماد الأمر. حدّث الصفحة ثم أعد المحاولة.",
    conflict: "تغيّرت الطلبية أو التسوية. حدّث الصفحة قبل إعادة المحاولة.",
    invalid: "راجع القيم المطلوبة ومبالغ الدينار الصحيحة.",
    mixedProvider: "اختر طلبيات شركة توصيل واحدة فقط.",
  },
} as const;

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
  count = false,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  count?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold tabular-nums">
            {count ? value : formatDZD(value)}
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
  const { locale } = useI18n();
  const text = TEXT[locale as keyof typeof TEXT] ?? TEXT.en;
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

  const selected = useMemo(
    () => summary.awaitingRemittance.filter((item) => settlementDraft(item).selected),
    [settlementLines, summary.awaitingRemittance],
  );
  const selectedProvider = selected[0]?.provider ?? null;
  const activeProvider = selectedProvider ?? batch.provider.trim() || null;
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

  function settlementDraft(item: CodPosition): SettlementDraft {
    return settlementLines[item.orderId] ?? {
      selected: false,
      gross: String(item.outstandingRemittance),
      fee: "0",
      adjustment: "0",
      isFinal: true,
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
            ? text.conflict
            : payload.code === "VALIDATION_ERROR"
              ? text.invalid
              : payload.error || text.failed;
        throw new Error(message);
      }
      window.localStorage.removeItem(storageKey);
      setNotice(payload.command?.replayed ? text.replayed : text.success);
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.failed);
      return false;
    } finally {
      setBusy("");
    }
  }

  function toggleOrder(item: CodPosition, checked: boolean): void {
    if (checked && selectedProvider && item.provider !== selectedProvider) {
      setError(text.mixedProvider);
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
    const lines = selected.map((item) => {
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
        orderId: undefined as never,
        expectedVersion: undefined as never,
        providerLineReference: batch.unmatchedReference.trim() || undefined,
        grossRemittedAmount: unmatchedGross,
        feeAmount: integer(batch.unmatchedFee),
        adjustmentAmount: integer(batch.unmatchedAdjustment),
        isFinal: true,
      });
    }
    if (!activeProvider || !batch.reference.trim() || lines.length === 0) {
      setError(text.invalid);
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
          {text.authority}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCcw className="me-1.5 h-4 w-4" />
          {text.refresh}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={text.expected} value={summary.totals.expectedReceivable} icon={CircleDollarSign} />
        <SummaryCard label={text.collected} value={summary.totals.effectiveCollected} icon={CheckCircle2} />
        <SummaryCard label={text.remitted} value={summary.totals.grossRemitted} icon={ReceiptText} />
        <SummaryCard label={text.net} value={summary.totals.netReceived} icon={Scale} />
        <SummaryCard label={text.fees} value={summary.totals.fees} icon={ReceiptText} />
        <SummaryCard label={text.collectPending} value={summary.totals.outstandingCollection} icon={Clock3} />
        <SummaryCard label={text.remitPending} value={summary.totals.outstandingRemittance} icon={Clock3} />
        <SummaryCard label={text.reviewCount} value={summary.reviewLines.length + summary.disputed.length} icon={AlertTriangle} count />
      </div>

      {notice ? (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{text.collectionTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{text.collectionHelp}</p>
        </CardHeader>
        <CardContent>
          {summary.awaitingCollection.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={text.noCollection} />
          ) : (
            <div className="space-y-4">
              {summary.awaitingCollection.map((item) => {
                const draft = collectionDraft(item);
                const operationKey = `collection:${item.orderId}:${item.orderVersion}`;
                return (
                  <div key={item.orderId} className="rounded-lg border p-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold">{item.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">{item.customerName}</p>
                      </div>
                      <p className="text-sm">{text.expectedAmount}: <strong>{formatDZD(item.expectedReceivable)}</strong></p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5"><Label>{text.amount}</Label><Input inputMode="numeric" value={draft.amount} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, amount: event.target.value } }))} /></div>
                      <div className="space-y-1.5"><Label>{text.provider}</Label><Input dir="auto" value={draft.provider} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, provider: event.target.value } }))} /></div>
                      <div className="space-y-1.5"><Label>{text.reference}</Label><Input dir="auto" value={draft.reference} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, reference: event.target.value } }))} /></div>
                      <div className="space-y-1.5"><Label>{text.date}</Label><Input type="datetime-local" value={draft.at} onChange={(event) => setCollections((current) => ({ ...current, [item.orderId]: { ...draft, at: event.target.value } }))} /></div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button disabled={Boolean(busy) || integer(draft.amount) <= 0 || !draft.provider.trim()} onClick={() => void commit(operationKey, `/api/orders/${item.orderId}/cod/collection`, { expectedVersion: item.orderVersion, amount: integer(draft.amount), provider: draft.provider.trim(), reference: draft.reference.trim() || undefined, collectedAt: new Date(draft.at).toISOString() })}>
                        {busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                        {text.collect}
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
          <CardTitle>{text.settlementTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{text.settlementHelp}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.awaitingRemittance.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={text.noRemittance} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start">{text.select}</th>
                    <th className="p-3 text-start">{text.order}</th>
                    <th className="p-3 text-start">{text.provider}</th>
                    <th className="p-3 text-end">{text.outstanding}</th>
                    <th className="p-3 text-end">{text.gross}</th>
                    <th className="p-3 text-end">{text.fees}</th>
                    <th className="p-3 text-end">{text.adjustment}</th>
                    <th className="p-3 text-center">{text.final}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.awaitingRemittance.map((item) => {
                    const draft = settlementDraft(item);
                    return (
                      <tr key={item.orderId} className={draft.selected ? "bg-primary/5" : undefined}>
                        <td className="p-3"><Checkbox checked={draft.selected} onCheckedChange={(value) => toggleOrder(item, value === true)} aria-label={`${text.select} ${item.orderNumber}`} /></td>
                        <td className="p-3"><p className="font-mono font-medium">{item.orderNumber}</p><p className="text-xs text-muted-foreground">{item.customerName}</p></td>
                        <td className="p-3" dir="auto">{item.provider}</td>
                        <td className="p-3 text-end tabular-nums">{formatDZD(item.outstandingRemittance)}</td>
                        <td className="p-3"><Input className="min-w-28 text-end" inputMode="numeric" disabled={!draft.selected} value={draft.gross} onChange={(event) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, gross: event.target.value } }))} /></td>
                        <td className="p-3"><Input className="min-w-24 text-end" inputMode="numeric" disabled={!draft.selected} value={draft.fee} onChange={(event) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, fee: event.target.value } }))} /></td>
                        <td className="p-3"><Input className="min-w-24 text-end" inputMode="numeric" disabled={!draft.selected} value={draft.adjustment} onChange={(event) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, adjustment: event.target.value } }))} /></td>
                        <td className="p-3 text-center"><Checkbox disabled={!draft.selected} checked={draft.isFinal} onCheckedChange={(value) => setSettlementLines((current) => ({ ...current, [item.orderId]: { ...draft, isFinal: value === true } }))} aria-label={text.final} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5"><Label>{text.provider}</Label><Input dir="auto" disabled={Boolean(selectedProvider)} value={selectedProvider ?? batch.provider} onChange={(event) => setBatch((current) => ({ ...current, provider: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{text.batchReference}</Label><Input dir="auto" value={batch.reference} onChange={(event) => setBatch((current) => ({ ...current, reference: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{text.date}</Label><Input type="datetime-local" value={batch.receivedAt} onChange={(event) => setBatch((current) => ({ ...current, receivedAt: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{text.evidenceName}</Label><Input dir="auto" value={batch.evidenceName} onChange={(event) => setBatch((current) => ({ ...current, evidenceName: event.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>{text.evidenceHash}</Label><Input dir="ltr" value={batch.evidenceHash} onChange={(event) => setBatch((current) => ({ ...current, evidenceHash: event.target.value }))} /></div>
              <div className="flex items-end gap-2"><Checkbox checked={batch.includeUnmatched} onCheckedChange={(value) => setBatch((current) => ({ ...current, includeUnmatched: value === true }))} aria-label={text.addUnmatched} /><Label>{text.addUnmatched}</Label></div>
            </div>

            {batch.includeUnmatched ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5"><Label>{text.unmatchedReference}</Label><Input dir="auto" value={batch.unmatchedReference} onChange={(event) => setBatch((current) => ({ ...current, unmatchedReference: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{text.gross}</Label><Input inputMode="numeric" value={batch.unmatchedGross} onChange={(event) => setBatch((current) => ({ ...current, unmatchedGross: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{text.fees}</Label><Input inputMode="numeric" value={batch.unmatchedFee} onChange={(event) => setBatch((current) => ({ ...current, unmatchedFee: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{text.adjustment}</Label><Input inputMode="numeric" value={batch.unmatchedAdjustment} onChange={(event) => setBatch((current) => ({ ...current, unmatchedAdjustment: event.target.value }))} /></div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{text.selectedGross}: <strong className="text-foreground">{formatDZD(selectedGross + (batch.includeUnmatched ? integer(batch.unmatchedGross) : 0))}</strong></p>
              <Button disabled={Boolean(busy) || !activeProvider || !batch.reference.trim() || (selected.length === 0 && integer(batch.unmatchedGross) <= 0)} onClick={() => void postBatch()}>
                {busy.startsWith("settlement:") ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                {text.postBatch}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.reviewTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{text.reviewHelp}</p>
        </CardHeader>
        <CardContent>
          {summary.reviewLines.length === 0 && summary.disputed.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={text.noReview} />
          ) : (
            <div className="space-y-4">
              {summary.reviewLines.map((line) => {
                const draft = reviewDraft(line);
                const matchingOrder = matchCandidates.find((item) => item.orderId === draft.orderId);
                const operationKey = line.unresolvedUnmatched
                  ? `match:${line.lineId}:${matchingOrder?.orderVersion ?? "none"}`
                  : `line-correction:${line.lineId}:${line.orderVersion ?? "unmatched"}`;
                return (
                  <div key={line.lineId} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><Badge variant={line.unresolvedUnmatched ? "secondary" : "destructive"}>{line.unresolvedUnmatched ? text.unmatched : text.disputed}</Badge><p className="mt-2 font-mono text-sm">{line.externalReference}</p><p className="text-xs text-muted-foreground">{line.provider} · {formatDate(line.receivedAt)}</p></div>
                      <div className="text-end text-sm tabular-nums"><p>{text.gross}: {formatDZD(line.effectiveGross)}</p><p>{text.fees}: {formatDZD(line.effectiveFee)}</p><p className={line.effectiveDiscrepancy === 0 ? "" : "text-destructive"}>{text.reviewCount}: {formatDZD(line.effectiveDiscrepancy)}</p></div>
                    </div>

                    {line.unresolvedUnmatched ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                        <div className="space-y-1.5"><Label>{text.matchOrder}</Label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.orderId} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, orderId: event.target.value } }))}><option value="">—</option>{matchCandidates.filter((item) => item.provider === line.provider).map((item) => <option key={item.orderId} value={item.orderId}>{item.orderNumber} · {item.customerName} · {formatDZD(item.outstandingRemittance)}</option>)}</select></div>
                        <div className="space-y-1.5"><Label>{text.reason}</Label><Input dir="auto" value={draft.reason} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, reason: event.target.value } }))} /></div>
                        <Button disabled={Boolean(busy) || !matchingOrder || !draft.reason.trim()} onClick={() => matchingOrder && void commit(operationKey, `/api/accounting/cod-settlements/lines/${line.lineId}/match`, { orderId: matchingOrder.orderId, expectedVersion: matchingOrder.orderVersion, reasonCode: draft.reason.trim(), occurredAt: new Date(draft.at).toISOString() })}>{busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{text.match}</Button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          <div className="space-y-1.5"><Label>{text.grossDelta}</Label><Input inputMode="numeric" value={draft.grossDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, grossDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label>{text.feeDelta}</Label><Input inputMode="numeric" value={draft.feeDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, feeDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label>{text.adjustmentDelta}</Label><Input inputMode="numeric" value={draft.adjustmentDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, adjustmentDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label>{text.discrepancyDelta}</Label><Input inputMode="numeric" value={draft.discrepancyDelta} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, discrepancyDelta: event.target.value } }))} /></div>
                          <div className="space-y-1.5"><Label>{text.reason}</Label><Input dir="auto" value={draft.reason} onChange={(event) => setReview((current) => ({ ...current, [line.lineId]: { ...draft, reason: event.target.value } }))} /></div>
                        </div>
                        <div className="flex justify-end"><Button disabled={Boolean(busy) || !draft.reason.trim()} onClick={() => void commit(operationKey, `/api/accounting/cod-settlements/lines/${line.lineId}/correction`, { expectedVersion: line.orderVersion ?? undefined, grossDelta: integer(draft.grossDelta), feeDelta: integer(draft.feeDelta), adjustmentDelta: integer(draft.adjustmentDelta), discrepancyDelta: integer(draft.discrepancyDelta), reasonCode: draft.reason.trim(), occurredAt: new Date(draft.at).toISOString() })}>{busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{text.correction}</Button></div>
                      </div>
                    )}
                  </div>
                );
              })}

              {summary.disputed.filter((item) => item.collectionId && item.discrepancy !== 0).map((item) => {
                const draft = collectionCorrectionDraft(item);
                const operationKey = `collection-correction:${item.orderId}:${item.orderVersion}`;
                return (
                  <div key={operationKey} className="rounded-lg border border-warning/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><Badge variant="outline">{text.collectionCorrection}</Badge><p className="mt-2 font-mono text-sm font-semibold">{item.orderNumber}</p><p className="text-sm text-muted-foreground">{item.customerName}</p></div><div className="text-end text-sm"><p>{text.expectedAmount}: {formatDZD(item.expectedReceivable)}</p><p>{text.collected}: {formatDZD(item.effectiveCollected)}</p><p className="text-destructive">{text.reviewCount}: {formatDZD(item.discrepancy)}</p></div></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end"><div className="space-y-1.5"><Label>{text.collectionDelta}</Label><Input inputMode="numeric" value={draft.delta} onChange={(event) => setCollectionCorrections((current) => ({ ...current, [item.orderId]: { ...draft, delta: event.target.value } }))} /></div><div className="space-y-1.5"><Label>{text.reason}</Label><Input dir="auto" value={draft.reason} onChange={(event) => setCollectionCorrections((current) => ({ ...current, [item.orderId]: { ...draft, reason: event.target.value } }))} /></div><Button disabled={Boolean(busy) || integer(draft.delta) === 0 || !draft.reason.trim()} onClick={() => void commit(operationKey, `/api/orders/${item.orderId}/cod/collection/correction`, { expectedVersion: item.orderVersion, amountDelta: integer(draft.delta), reasonCode: draft.reason.trim(), occurredAt: new Date(draft.at).toISOString() })}>{busy === operationKey ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{text.correction}</Button></div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{text.recentTitle}</CardTitle></CardHeader>
        <CardContent>
          {summary.recentSettlements.length === 0 ? (
            <EmptyState icon={ReceiptText} title={text.noRecent} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/60 text-muted-foreground"><tr><th className="p-3 text-start">{text.reference}</th><th className="p-3 text-start">{text.provider}</th><th className="p-3 text-start">{text.state}</th><th className="p-3 text-end">{text.gross}</th><th className="p-3 text-end">{text.fees}</th><th className="p-3 text-end">{text.net}</th><th className="p-3 text-end">{text.reviewCount}</th></tr></thead>
                <tbody className="divide-y">{summary.recentSettlements.map((item) => <tr key={item.settlementId}><td className="p-3"><p className="font-mono font-medium">{item.externalReference}</p><p className="text-xs text-muted-foreground">{formatDate(item.receivedAt)} · {item.lineCount} {text.lines}</p></td><td className="p-3" dir="auto">{item.provider}</td><td className="p-3"><Badge variant={item.status === "posted" ? "outline" : "destructive"}>{item.status === "posted" ? text.posted : text.needsReview}</Badge></td><td className="p-3 text-end tabular-nums">{formatDZD(item.grossAmount)}</td><td className="p-3 text-end tabular-nums">{formatDZD(item.feeAmount)}</td><td className="p-3 text-end tabular-nums">{formatDZD(item.netAmount)}</td><td className="p-3 text-end tabular-nums">{formatDZD(item.discrepancyAmount + item.unmatchedAmount)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
