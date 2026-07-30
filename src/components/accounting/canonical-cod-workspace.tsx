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

export interface CanonicalCodWorkspaceSummary {
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

interface MutationState {
  key: string;
  error: string | null;
}

const COPY = {
  en: {
    title: "Canonical COD settlement",
    authority: "Governed financial authority",
    expected: "Expected receivable",
    collected: "Collected by couriers",
    gross: "Gross remitted",
    fees: "Courier fees",
    net: "Net received",
    outstandingCollection: "Awaiting collection",
    outstandingRemittance: "Awaiting remittance",
    review: "Needs reconciliation",
    collectionQueue: "Collection queue",
    collectionQueueHelp: "Record the courier's collected cash against the immutable delivered receivable.",
    noCollection: "No delivered COD receivable is awaiting collection.",
    order: "Order",
    customer: "Customer",
    amount: "Amount",
    provider: "Courier / provider",
    reference: "Reference",
    date: "Date",
    recordCollection: "Record collection",
    correction: "Correction",
    correctionDelta: "Amount delta",
    reason: "Reason code",
    applyCorrection: "Append correction",
    settlementQueue: "Remittance batch",
    settlementHelp: "Select orders from one courier, then post gross remittance, fees and adjustments as one evidence batch.",
    noRemittance: "No collected COD amount is awaiting remittance.",
    selectAll: "Select all for this courier",
    final: "Final line",
    partial: "Partial",
    externalReference: "Batch reference",
    evidenceName: "Evidence name (optional)",
    evidenceHash: "Evidence SHA-256 (optional)",
    postSettlement: "Post settlement batch",
    selectedTotal: "Selected gross",
    sameProvider: "A batch can contain orders from one courier only.",
    reviewQueue: "Discrepancy and unmatched queue",
    reviewHelp: "Match provider lines to an order or append a correction. Existing money facts are never edited.",
    noReview: "No COD line currently requires reconciliation.",
    unmatched: "Unmatched",
    disputed: "Disputed",
    matchOrder: "Match to order",
    match: "Append match",
    grossDelta: "Gross delta",
    feeDelta: "Fee delta",
    adjustmentDelta: "Adjustment delta",
    discrepancyDelta: "Discrepancy delta",
    recent: "Recent settlement batches",
    noSettlements: "No canonical settlement batch has been posted.",
    posted: "Posted",
    needsReview: "Needs review",
    lines: "lines",
    refresh: "Refresh",
    success: "The governed COD command was committed.",
    replayed: "The already committed command was recovered safely.",
    failed: "The command was not committed. Refresh the current facts and retry.",
    conflict: "The order or settlement changed. Refresh before retrying.",
    invalid: "Review the entered amounts and required evidence.",
    commandBusy: "A governed command is being committed.",
    providerPlaceholder: "manual-courier",
    reasonPlaceholder: "provider-statement-corrected",
    collectionReferencePlaceholder: "Collection receipt",
    batchReferencePlaceholder: "Courier remittance reference",
    unmatchedOrderPlaceholder: "Select an awaiting order",
    expectedAmount: "Expected",
    effectiveCollected: "Collected",
    outstanding: "Outstanding",
    state: "State",
  },
  fr: {
    title: "Règlement COD canonique",
    authority: "Autorité financière gouvernée",
    expected: "Créance attendue",
    collected: "Encaissé par les transporteurs",
    gross: "Versement brut",
    fees: "Frais transporteur",
    net: "Net reçu",
    outstandingCollection: "À encaisser",
    outstandingRemittance: "À verser",
    review: "À rapprocher",
    collectionQueue: "File d'encaissement",
    collectionQueueHelp: "Enregistrez l'argent encaissé par le transporteur face à la créance livrée immuable.",
    noCollection: "Aucune créance COD livrée n'attend un encaissement.",
    order: "Commande",
    customer: "Client",
    amount: "Montant",
    provider: "Transporteur / fournisseur",
    reference: "Référence",
    date: "Date",
    recordCollection: "Enregistrer l'encaissement",
    correction: "Correction",
    correctionDelta: "Delta du montant",
    reason: "Code motif",
    applyCorrection: "Ajouter la correction",
    settlementQueue: "Lot de versement",
    settlementHelp: "Sélectionnez les commandes d'un transporteur puis enregistrez le brut, les frais et les ajustements dans un lot probant.",
    noRemittance: "Aucun montant COD encaissé n'attend un versement.",
    selectAll: "Tout sélectionner pour ce transporteur",
    final: "Ligne finale",
    partial: "Partiel",
    externalReference: "Référence du lot",
    evidenceName: "Nom de la preuve (facultatif)",
    evidenceHash: "SHA-256 de la preuve (facultatif)",
    postSettlement: "Enregistrer le lot",
    selectedTotal: "Brut sélectionné",
    sameProvider: "Un lot ne peut contenir qu'un seul transporteur.",
    reviewQueue: "File des écarts et lignes non rapprochées",
    reviewHelp: "Rattachez une ligne à une commande ou ajoutez une correction. Les faits financiers existants ne sont jamais modifiés.",
    noReview: "Aucune ligne COD ne nécessite actuellement de rapprochement.",
    unmatched: "Non rapprochée",
    disputed: "En litige",
    matchOrder: "Rattacher à une commande",
    match: "Ajouter le rapprochement",
    grossDelta: "Delta brut",
    feeDelta: "Delta frais",
    adjustmentDelta: "Delta ajustement",
    discrepancyDelta: "Delta écart",
    recent: "Lots de versement récents",
    noSettlements: "Aucun lot canonique n'a été enregistré.",
    posted: "Enregistré",
    needsReview: "À vérifier",
    lines: "lignes",
    refresh: "Actualiser",
    success: "La commande COD gouvernée a été validée.",
    replayed: "La commande déjà validée a été récupérée en sécurité.",
    failed: "La commande n'a pas été validée. Actualisez les faits puis réessayez.",
    conflict: "La commande ou le règlement a changé. Actualisez avant de réessayer.",
    invalid: "Vérifiez les montants et les preuves requises.",
    commandBusy: "Une commande gouvernée est en cours de validation.",
    providerPlaceholder: "transporteur-manuel",
    reasonPlaceholder: "releve-transporteur-corrige",
    collectionReferencePlaceholder: "Reçu d'encaissement",
    batchReferencePlaceholder: "Référence du versement",
    unmatchedOrderPlaceholder: "Sélectionner une commande en attente",
    expectedAmount: "Attendu",
    effectiveCollected: "Encaissé",
    outstanding: "Restant",
    state: "État",
  },
  ar: {
    title: "تسوية الدفع عند الاستلام الموثوقة",
    authority: "صلاحية مالية محكومة",
    expected: "المستحق المتوقع",
    collected: "المحصّل لدى شركات التوصيل",
    gross: "التحويل الإجمالي",
    fees: "رسوم شركة التوصيل",
    net: "الصافي المستلم",
    outstandingCollection: "بانتظار التحصيل",
    outstandingRemittance: "بانتظار التحويل",
    review: "بحاجة إلى مطابقة",
    collectionQueue: "قائمة التحصيل",
    collectionQueueHelp: "سجّل المبلغ الذي حصّلته شركة التوصيل مقابل مستحق التسليم الثابت.",
    noCollection: "لا توجد مستحقات دفع عند الاستلام بانتظار التحصيل.",
    order: "الطلبية",
    customer: "الزبون",
    amount: "المبلغ",
    provider: "شركة التوصيل / المزوّد",
    reference: "المرجع",
    date: "التاريخ",
    recordCollection: "تسجيل التحصيل",
    correction: "تصحيح",
    correctionDelta: "فرق المبلغ",
    reason: "رمز السبب",
    applyCorrection: "إضافة التصحيح",
    settlementQueue: "دفعة التحويل",
    settlementHelp: "اختر طلبيات شركة توصيل واحدة ثم سجّل الإجمالي والرسوم والتعديلات كدفعة موثقة واحدة.",
    noRemittance: "لا توجد مبالغ محصّلة بانتظار التحويل.",
    selectAll: "اختيار كل طلبيات هذه الشركة",
    final: "سطر نهائي",
    partial: "جزئي",
    externalReference: "مرجع الدفعة",
    evidenceName: "اسم الدليل (اختياري)",
    evidenceHash: "بصمة SHA-256 للدليل (اختياري)",
    postSettlement: "اعتماد دفعة التحويل",
    selectedTotal: "الإجمالي المختار",
    sameProvider: "يجب أن تحتوي الدفعة على شركة توصيل واحدة فقط.",
    reviewQueue: "قائمة الفروقات والأسطر غير المطابقة",
    reviewHelp: "اربط سطر المزوّد بطلبية أو أضف تصحيحًا. لا يتم تعديل الحقائق المالية السابقة.",
    noReview: "لا يوجد سطر دفع عند الاستلام يحتاج إلى مطابقة حاليًا.",
    unmatched: "غير مطابق",
    disputed: "متنازع عليه",
    matchOrder: "ربطه بطلبية",
    match: "إضافة المطابقة",
    grossDelta: "فرق الإجمالي",
    feeDelta: "فرق الرسوم",
    adjustmentDelta: "فرق التعديل",
    discrepancyDelta: "فرق المطابقة",
    recent: "دفعات التحويل الأخيرة",
    noSettlements: "لم تُسجّل أي دفعة تحويل موثوقة بعد.",
    posted: "معتمدة",
    needsReview: "بحاجة إلى مراجعة",
    lines: "أسطر",
    refresh: "تحديث",
    success: "تم اعتماد أمر الدفع عند الاستلام الموثوق.",
    replayed: "تمت استعادة الأمر المعتمد سابقًا بأمان.",
    failed: "لم يتم اعتماد الأمر. حدّث الحقائق الحالية ثم أعد المحاولة.",
    conflict: "تغيّرت الطلبية أو التسوية. حدّث الصفحة قبل إعادة المحاولة.",
    invalid: "راجع المبالغ والأدلة المطلوبة.",
    commandBusy: "جارٍ اعتماد أمر مالي موثوق.",
    providerPlaceholder: "شركة-توصيل-يدوية",
    reasonPlaceholder: "تصحيح-كشف-شركة-التوصيل",
    collectionReferencePlaceholder: "وصل التحصيل",
    batchReferencePlaceholder: "مرجع تحويل شركة التوصيل",
    unmatchedOrderPlaceholder: "اختر طلبية بانتظار التحويل",
    expectedAmount: "المتوقع",
    effectiveCollected: "المحصّل",
    outstanding: "المتبقي",
    state: "الحالة",
  },
} as const;

function nowLocalInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function commandKey(storageKey: string): string {
  const previous = window.localStorage.getItem(storageKey);
  if (previous && previous.length >= 8) return previous;
  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}

export function CanonicalCodWorkspace({
  summary,
}: {
  summary: CanonicalCodWorkspaceSummary;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.en;
  const [mutation, setMutation] = useState<MutationState>({ key: "", error: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [collectionDrafts, setCollectionDrafts] = useState<Record<string, {
    amount: string;
    provider: string;
    reference: string;
    collectedAt: string;
  }>>({});
  const [collectionCorrections, setCollectionCorrections] = useState<Record<string, {
    delta: string;
    reason: string;
    occurredAt: string;
  }>>({});
  const [settlementDrafts, setSettlementDrafts] = useState<Record<string, SettlementDraft>>({});
  const [settlementMeta, setSettlementMeta] = useState({
    externalReference: "",
    evidenceName: "",
    evidenceSha256: "",
    receivedAt: nowLocalInput(),
  });
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, {
    orderId: string;
    reason: string;
    occurredAt: string;
    grossDelta: string;
    feeDelta: string;
    adjustmentDelta: string;
    discrepancyDelta: string;
  }>>({});

  const selectedOrders = useMemo(
    () => summary.awaitingRemittance.filter((order) => settlementDrafts[order.orderId]?.selected),
    [settlementDrafts, summary.awaitingRemittance],
  );
  const selectedProvider = selectedOrders[0]?.provider ?? null;
  const selectedGross = selectedOrders.reduce(
    (total, order) =>
      total + numberValue(settlementDrafts[order.orderId]?.gross ?? String(order.outstandingRemittance)),
    0,
  );
  const matchCandidates = useMemo(() => {
    const merged = [...summary.awaitingRemittance, ...summary.disputed];
    const seen = new Set<string>();
    return merged.filter((order) => {
      if (seen.has(order.orderId) || order.outstandingRemittance <= 0) return false;
      seen.add(order.orderId);
      return true;
    });
  }, [summary.awaitingRemittance, summary.disputed]);

  async function commit(
    key: string,
    url: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    setMutation({ key, error: null });
    setNotice(null);
    const storageKey = `sf-canonical-cod:${key}`;
    const idempotencyKey = commandKey(storageKey);
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
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        command?: { replayed?: boolean };
      };
      if (!response.ok) {
        const message =
          data.code === "CONFLICT"
            ? copy.conflict
            : data.code === "VALIDATION_ERROR"
              ? copy.invalid
              : data.error || copy.failed;
        throw new Error(message);
      }
      window.localStorage.removeItem(storageKey);
      setNotice(data.command?.replayed ? copy.replayed : copy.success);
      router.refresh();
    } catch (error) {
      setMutation({
        key: "",
        error: error instanceof Error ? error.message : copy.failed,
      });
      return;
    }
    setMutation({ key: "", error: null });
  }

  function collectionDraft(order: CodPosition) {
    return collectionDrafts[order.orderId] ?? {
      amount: String(order.outstandingCollection || order.expectedReceivable),
      provider: order.provider ?? "manual-courier",
      reference: "",
      collectedAt: nowLocalInput(),
    };
  }

  function correctionDraft(order: CodPosition) {
    return collectionCorrections[order.orderId] ?? {
      delta: String(-order.discrepancy),
      reason: "provider-statement-corrected",
      occurredAt: nowLocalInput(),
    };
  }

  function settlementDraft(order: CodPosition): SettlementDraft {
    return settlementDrafts[order.orderId] ?? {
      selected: false,
      gross: String(order.outstandingRemittance),
      fee: "0",
      adjustment: "0",
      isFinal: true,
    };
  }

  function reviewDraft(line: ReviewLine) {
    return reviewDrafts[line.lineId] ?? {
      orderId: "",
      reason: line.unresolvedUnmatched
        ? "provider-reference-reconciled"
        : "provider-statement-corrected",
      occurredAt: nowLocalInput(),
      grossDelta: "0",
      feeDelta: "0",
      adjustmentDelta: "0",
      discrepancyDelta: String(-line.effectiveDiscrepancy),
    };
  }

  function toggleSettlement(order: CodPosition, selected: boolean): void {
    if (selectedProvider && selectedProvider !== order.provider && selected) {
      setMutation({ key: "", error: copy.sameProvider });
      return;
    }
    setMutation({ key: "", error: null });
    setSettlementDrafts((current) => ({
      ...current,
      [order.orderId]: {
        ...settlementDraft(order),
        selected,
      },
    }));
  }

  function selectProviderOrders(provider: string): void {
    const eligible = summary.awaitingRemittance.filter((order) => order.provider === provider);
    const allSelected = eligible.every((order) => settlementDraft(order).selected);
    setSettlementDrafts((current) => {
      const next = { ...current };
      for (const order of eligible) {
        next[order.orderId] = {
          ...settlementDraft(order),
          selected: !allSelected,
        };
      }
      return next;
    });
  }

  async function postSettlement(): Promise<void> {
    if (!selectedProvider || !settlementMeta.externalReference.trim() || selectedOrders.length === 0) {
      setMutation({ key: "", error: copy.invalid });
      return;
    }
    await commit(
      `settlement:${selectedProvider}:${settlementMeta.externalReference}`,
      "/api/accounting/cod-settlements",
      {
        provider: selectedProvider,
        externalReference: settlementMeta.externalReference.trim(),
        receivedAt: new Date(settlementMeta.receivedAt).toISOString(),
        evidenceName: settlementMeta.evidenceName.trim() || undefined,
        evidenceSha256: settlementMeta.evidenceSha256.trim() || undefined,
        lines: selectedOrders.map((order) => {
          const draft = settlementDraft(order);
          return {
            orderId: order.orderId,
            expectedVersion: order.orderVersion,
            providerLineReference: `${settlementMeta.externalReference.trim()}:${order.orderNumber}`,
            grossRemittedAmount: numberValue(draft.gross),
            feeAmount: numberValue(draft.fee),
            adjustmentAmount: numberValue(draft.adjustment),
            isFinal: draft.isFinal,
          };
        }),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="outline" className="gap-1.5">
          <Scale className="h-3.5 w-3.5" />
          {copy.authority}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCcw className="me-1.5 h-4 w-4" />
          {copy.refresh}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [copy.expected, summary.totals.expectedReceivable, CircleDollarSign],
          [copy.collected, summary.totals.effectiveCollected, CheckCircle2],
          [copy.gross, summary.totals.grossRemitted, ReceiptText],
          [copy.net, summary.totals.netReceived, Scale],
          [copy.fees, summary.totals.fees, ReceiptText],
          [copy.outstandingCollection, summary.totals.outstandingCollection, Clock3],
          [copy.outstandingRemittance, summary.totals.outstandingRemittance, Clock3],
          [copy.review, summary.counts.settlementsNeedingReview, AlertTriangle],
        ].map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{String(label)}</p>
                <p className="mt-1 truncate text-lg font-semibold tabular-nums">
                  {typeof value === "number" && label !== copy.review
                    ? formatDZD(value)
                    : String(value)}
                </p>
              </div>
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      {notice ? <p role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p> : null}
      {mutation.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{mutation.error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy.collectionQueue}</CardTitle>
          <p className="text-sm text-muted-foreground">{copy.collectionQueueHelp}</p>
        </CardHeader>
        <CardContent>
          {summary.awaitingCollection.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={copy.noCollection} />
          ) : (
            <div className="space-y-4">
              {summary.awaitingCollection.map((order) => {
                const draft = collectionDraft(order);
                return (
                  <div key={order.orderId} className="rounded-lg border p-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold">{order.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">{order.customerName}</p>
                      </div>
                      <div className="text-end text-sm">
                        <p>{copy.expectedAmount}: <strong>{formatDZD(order.expectedReceivable)}</strong></p>
                        <p className="text-warning">{copy.outstanding}: {formatDZD(order.outstandingCollection)}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label>{copy.amount}</Label>
                        <Input
                          inputMode="numeric"
                          value={draft.amount}
                          onChange={(event) => setCollectionDrafts((current) => ({
                            ...current,
                            [order.orderId]: { ...draft, amount: event.target.value },
                          }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{copy.provider}</Label>
                        <Input
                          dir="auto"
                          value={draft.provider}
                          placeholder={copy.providerPlaceholder}
                          onChange={(event) => setCollectionDrafts((current) => ({
                            ...current,
                            [order.orderId]: { ...draft, provider: event.target.value },
                          }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{copy.reference}</Label>
                        <Input
                          dir="auto"
                          value={draft.reference}
                          placeholder={copy.collectionReferencePlaceholder}
                          onChange={(event) => setCollectionDrafts((current) => ({
                            ...current,
                            [order.orderId]: { ...draft, reference: event.target.value },
                          }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{copy.date}</Label>
                        <Input
                          type="datetime-local"
                          value={draft.collectedAt}
                          onChange={(event) => setCollectionDrafts((current) => ({
                            ...current,
                            [order.orderId]: { ...draft, collectedAt: event.target.value },
                          }))}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        disabled={Boolean(mutation.key)}
                        onClick={() => void commit(
                          `collection:${order.orderId}:${order.orderVersion}`,
                          `/api/orders/${order.orderId}/cod/collection`,
                          {
                            expectedVersion: order.orderVersion,
                            amount: numberValue(draft.amount),
                            provider: draft.provider.trim(),
                            reference: draft.reference.trim() || undefined,
                            collectedAt: new Date(draft.collectedAt).toISOString(),
                          },
                        )}
                      >
                        {mutation.key.startsWith(`collection:${order.orderId}:`) ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                        {copy.recordCollection}
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
          <CardTitle>{copy.settlementQueue}</CardTitle>
          <p className="text-sm text-muted-foreground">{copy.settlementHelp}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.awaitingRemittance.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={copy.noRemittance} />
          ) : (
            <>
              {Array.from(new Set(summary.awaitingRemittance.map((order) => order.provider).filter(Boolean))).map((provider) => (
                <Button key={provider} variant="outline" size="sm" onClick={() => selectProviderOrders(provider!)}>
                  {copy.selectAll}: {provider}
                </Button>
              ))}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="border-b bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start"></th>
                      <th className="p-3 text-start">{copy.order}</th>
                      <th className="p-3 text-start">{copy.provider}</th>
                      <th className="p-3 text-end">{copy.outstanding}</th>
                      <th className="p-3 text-end">{copy.gross}</th>
                      <th className="p-3 text-end">{copy.fees}</th>
                      <th className="p-3 text-end">{copy.adjustmentDelta}</th>
                      <th className="p-3 text-center">{copy.final}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {summary.awaitingRemittance.map((order) => {
                      const draft = settlementDraft(order);
                      return (
                        <tr key={order.orderId} className={draft.selected ? "bg-primary/5" : undefined}>
                          <td className="p-3">
                            <Checkbox
                              checked={draft.selected}
                              onCheckedChange={(checked) => toggleSettlement(order, checked === true)}
                              aria-label={`${copy.order} ${order.orderNumber}`}
                            />
                          </td>
                          <td className="p-3">
                            <p className="font-mono font-medium">{order.orderNumber}</p>
                            <p className="text-xs text-muted-foreground">{order.customerName}</p>
                          </td>
                          <td className="p-3" dir="auto">{order.provider}</td>
                          <td className="p-3 text-end tabular-nums">{formatDZD(order.outstandingRemittance)}</td>
                          <td className="p-3"><Input className="min-w-28 text-end" inputMode="numeric" disabled={!draft.selected} value={draft.gross} onChange={(event) => setSettlementDrafts((current) => ({ ...current, [order.orderId]: { ...draft, gross: event.target.value } }))} /></td>
                          <td className="p-3"><Input className="min-w-24 text-end" inputMode="numeric" disabled={!draft.selected} value={draft.fee} onChange={(event) => setSettlementDrafts((current) => ({ ...current, [order.orderId]: { ...draft, fee: event.target.value } }))} /></td>
                          <td className="p-3"><Input className="min-w-24 text-end" inputMode="numeric" disabled={!draft.selected} value={draft.adjustment} onChange={(event) => setSettlementDrafts((current) => ({ ...current, [order.orderId]: { ...draft, adjustment: event.target.value } }))} /></td>
                          <td className="p-3 text-center"><Checkbox disabled={!draft.selected} checked={draft.isFinal} onCheckedChange={(checked) => setSettlementDrafts((current) => ({ ...current, [order.orderId]: { ...draft, isFinal: checked === true } }))} aria-label={copy.final} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedOrders.length > 0 ? (
                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>{copy.externalReference}</Label>
                      <Input dir="auto" value={settlementMeta.externalReference} placeholder={copy.batchReferencePlaceholder} onChange={(event) => setSettlementMeta((current) => ({ ...current, externalReference: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{copy.date}</Label>
                      <Input type="datetime-local" value={settlementMeta.receivedAt} onChange={(event) => setSettlementMeta((current) => ({ ...current, receivedAt: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{copy.evidenceName}</Label>
                      <Input dir="auto" value={settlementMeta.evidenceName} onChange={(event) => setSettlementMeta((current) => ({ ...current, evidenceName: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{copy.evidenceHash}</Label>
                      <Input dir="ltr" value={settlementMeta.evidenceSha256} onChange={(event) => setSettlementMeta((current) => ({ ...current, evidenceSha256: event.target.value }))} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{copy.selectedTotal}: <strong className="text-foreground">{formatDZD(selectedGross)}</strong> · {selectedProvider}</p>
                    <Button disabled={Boolean(mutation.key) || !settlementMeta.externalReference.trim()} onClick={() => void postSettlement()}>
                      {mutation.key.startsWith("settlement:") ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                      {copy.postSettlement}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.reviewQueue}</CardTitle>
          <p className="text-sm text-muted-foreground">{copy.reviewHelp}</p>
        </CardHeader>
        <CardContent>
          {summary.reviewLines.length === 0 && summary.disputed.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={copy.noReview} />
          ) : (
            <div className="space-y-4">
              {summary.reviewLines.map((line) => {
                const draft = reviewDraft(line);
                return (
                  <div key={line.lineId} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Badge variant={line.unresolvedUnmatched ? "secondary" : "destructive"}>{line.unresolvedUnmatched ? copy.unmatched : copy.disputed}</Badge>
                        <p className="mt-2 font-mono text-sm">{line.externalReference}</p>
                        <p className="text-xs text-muted-foreground">{line.provider} · {formatDate(line.receivedAt)}</p>
                      </div>
                      <div className="text-end text-sm tabular-nums">
                        <p>{copy.gross}: {formatDZD(line.effectiveGross)}</p>
                        <p>{copy.fees}: {formatDZD(line.effectiveFee)}</p>
                        <p className={line.effectiveDiscrepancy === 0 ? "" : "text-destructive"}>{copy.review}: {formatDZD(line.effectiveDiscrepancy)}</p>
                      </div>
                    </div>

                    {line.unresolvedUnmatched ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                        <div className="space-y-1.5">
                          <Label>{copy.matchOrder}</Label>
                          <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={draft.orderId}
                            onChange={(event) => setReviewDrafts((current) => ({ ...current, [line.lineId]: { ...draft, orderId: event.target.value } }))}
                          >
                            <option value="">{copy.unmatchedOrderPlaceholder}</option>
                            {matchCandidates.filter((order) => order.provider === line.provider).map((order) => (
                              <option key={order.orderId} value={order.orderId}>{order.orderNumber} · {order.customerName} · {formatDZD(order.outstandingRemittance)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{copy.reason}</Label>
                          <Input dir="auto" value={draft.reason} placeholder={copy.reasonPlaceholder} onChange={(event) => setReviewDrafts((current) => ({ ...current, [line.lineId]: { ...draft, reason: event.target.value } }))} />
                        </div>
                        <Button
                          disabled={Boolean(mutation.key) || !draft.orderId || !draft.reason.trim()}
                          onClick={() => {
                            const order = matchCandidates.find((candidate) => candidate.orderId === draft.orderId);
                            if (!order) return;
                            void commit(
                              `match:${line.lineId}:${order.orderVersion}`,
                              `/api/accounting/cod-settlements/lines/${line.lineId}/match`,
                              {
                                orderId: order.orderId,
                                expectedVersion: order.orderVersion,
                                reasonCode: draft.reason.trim(),
                                occurredAt: new Date(draft.occurredAt).toISOString(),
                              },
                            );
                          }}
                        >
                          {mutation.key.startsWith(`match:${line.lineId}:`) ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                          {copy.match}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          {[
                            [copy.grossDelta, "grossDelta"],
                            [copy.feeDelta, "feeDelta"],
                            [copy.adjustmentDelta, "adjustmentDelta"],
                            [copy.discrepancyDelta, "discrepancyDelta"],
                          ].map(([label, key]) => (
                            <div key={key} className="space-y-1.5">
                              <Label>{label}</Label>
                              <Input inputMode="numeric" value={draft[key as keyof typeof draft]} onChange={(event) => setReviewDrafts((current) => ({ ...current, [line.lineId]: { ...draft, [key]: event.target.value } }))} />
                            </div>
                          ))}
                          <div className="space-y-1.5">
                            <Label>{copy.reason}</Label>
                            <Input dir="auto" value={draft.reason} onChange={(event) => setReviewDrafts((current) => ({ ...current, [line.lineId]: { ...draft, reason: event.target.value } }))} />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            disabled={Boolean(mutation.key) || !draft.reason.trim()}
                            onClick={() => void commit(
                              `settlement-correction:${line.lineId}:${line.orderVersion ?? "unmatched"}`,
                              `/api/accounting/cod-settlements/lines/${line.lineId}/correction`,
                              {
                                expectedVersion: line.orderVersion ?? undefined,
                                grossDelta: numberValue(draft.grossDelta),
                                feeDelta: numberValue(draft.feeDelta),
                                adjustmentDelta: numberValue(draft.adjustmentDelta),
                                discrepancyDelta: numberValue(draft.discrepancyDelta),
                                reasonCode: draft.reason.trim(),
                                occurredAt: new Date(draft.occurredAt).toISOString(),
                              },
                            )}
                          >
                            {mutation.key.startsWith(`settlement-correction:${line.lineId}:`) ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                            {copy.applyCorrection}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {summary.disputed.filter((order) => order.collectionId && order.discrepancy !== 0).map((order) => {
                const draft = correctionDraft(order);
                return (
                  <div key={`collection-${order.orderId}`} className="rounded-lg border border-warning/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Badge variant="outline">{copy.correction}</Badge>
                        <p className="mt-2 font-mono text-sm font-semibold">{order.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">{order.customerName}</p>
                      </div>
                      <div className="text-end text-sm">
                        <p>{copy.expectedAmount}: {formatDZD(order.expectedReceivable)}</p>
                        <p>{copy.effectiveCollected}: {formatDZD(order.effectiveCollected)}</p>
                        <p className="text-destructive">{copy.review}: {formatDZD(order.discrepancy)}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
                      <div className="space-y-1.5"><Label>{copy.correctionDelta}</Label><Input inputMode="numeric" value={draft.delta} onChange={(event) => setCollectionCorrections((current) => ({ ...current, [order.orderId]: { ...draft, delta: event.target.value } }))} /></div>
                      <div className="space-y-1.5"><Label>{copy.reason}</Label><Input dir="auto" value={draft.reason} onChange={(event) => setCollectionCorrections((current) => ({ ...current, [order.orderId]: { ...draft, reason: event.target.value } }))} /></div>
                      <Button disabled={Boolean(mutation.key) || !draft.reason.trim()} onClick={() => void commit(`collection-correction:${order.orderId}:${order.orderVersion}`, `/api/orders/${order.orderId}/cod/collection/correction`, { expectedVersion: order.orderVersion, amountDelta: numberValue(draft.delta), reasonCode: draft.reason.trim(), occurredAt: new Date(draft.occurredAt).toISOString() })}>
                        {mutation.key.startsWith(`collection-correction:${order.orderId}:`) ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                        {copy.applyCorrection}
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
        <CardHeader><CardTitle>{copy.recent}</CardTitle></CardHeader>
        <CardContent>
          {summary.recentSettlements.length === 0 ? (
            <EmptyState icon={ReceiptText} title={copy.noSettlements} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b bg-muted/60 text-muted-foreground"><tr><th className="p-3 text-start">{copy.reference}</th><th className="p-3 text-start">{copy.provider}</th><th className="p-3 text-start">{copy.state}</th><th className="p-3 text-end">{copy.gross}</th><th className="p-3 text-end">{copy.fees}</th><th className="p-3 text-end">{copy.net}</th><th className="p-3 text-end">{copy.review}</th></tr></thead>
                <tbody className="divide-y">
                  {summary.recentSettlements.map((settlement) => (
                    <tr key={settlement.settlementId}>
                      <td className="p-3"><p className="font-mono font-medium">{settlement.externalReference}</p><p className="text-xs text-muted-foreground">{formatDate(settlement.receivedAt)} · {settlement.lineCount} {copy.lines}</p></td>
                      <td className="p-3" dir="auto">{settlement.provider}</td>
                      <td className="p-3"><Badge variant={settlement.status === "posted" ? "outline" : "destructive"}>{settlement.status === "posted" ? copy.posted : copy.needsReview}</Badge></td>
                      <td className="p-3 text-end tabular-nums">{formatDZD(settlement.grossAmount)}</td>
                      <td className="p-3 text-end tabular-nums">{formatDZD(settlement.feeAmount)}</td>
                      <td className="p-3 text-end tabular-nums">{formatDZD(settlement.netAmount)}</td>
                      <td className="p-3 text-end tabular-nums">{formatDZD(settlement.discrepancyAmount + settlement.unmatchedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
