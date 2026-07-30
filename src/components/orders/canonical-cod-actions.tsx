"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, ExternalLink, Loader2, Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const COPY = {
  en: {
    title: "Canonical COD position",
    authority: "Governed financial authority",
    expected: "Expected receivable",
    collected: "Collected",
    remitted: "Gross remitted",
    fees: "Courier fees",
    outstanding: "Outstanding",
    discrepancy: "Discrepancy",
    loading: "Loading governed COD facts…",
    unavailable: "The governed COD position is temporarily unavailable.",
    provider: "Courier / provider",
    amount: "Collected amount",
    reference: "Collection reference",
    date: "Collected at",
    record: "Record collection",
    correction: "Append collection correction",
    delta: "Amount delta",
    reason: "Reason code",
    openWorkspace: "Open COD settlement workspace",
    success: "The governed COD command was committed.",
    replayed: "The already committed command was recovered safely.",
    failed: "The command was not committed. Refresh and retry.",
    conflict: "The order changed. Refresh before retrying.",
  },
  fr: {
    title: "Position COD canonique",
    authority: "Autorité financière gouvernée",
    expected: "Créance attendue",
    collected: "Encaissé",
    remitted: "Versement brut",
    fees: "Frais transporteur",
    outstanding: "Restant",
    discrepancy: "Écart",
    loading: "Chargement des faits COD gouvernés…",
    unavailable: "La position COD gouvernée est temporairement indisponible.",
    provider: "Transporteur / fournisseur",
    amount: "Montant encaissé",
    reference: "Référence d'encaissement",
    date: "Date d'encaissement",
    record: "Enregistrer l'encaissement",
    correction: "Ajouter une correction d'encaissement",
    delta: "Delta du montant",
    reason: "Code motif",
    openWorkspace: "Ouvrir l'espace de règlement COD",
    success: "La commande COD gouvernée a été validée.",
    replayed: "La commande déjà validée a été récupérée en sécurité.",
    failed: "La commande n'a pas été validée. Actualisez puis réessayez.",
    conflict: "La commande a changé. Actualisez avant de réessayer.",
  },
  ar: {
    title: "وضعية الدفع عند الاستلام الموثوقة",
    authority: "صلاحية مالية محكومة",
    expected: "المستحق المتوقع",
    collected: "المحصّل",
    remitted: "التحويل الإجمالي",
    fees: "رسوم شركة التوصيل",
    outstanding: "المتبقي",
    discrepancy: "الفرق",
    loading: "جارٍ تحميل حقائق الدفع عند الاستلام…",
    unavailable: "وضعية الدفع عند الاستلام غير متاحة مؤقتًا.",
    provider: "شركة التوصيل / المزوّد",
    amount: "المبلغ المحصّل",
    reference: "مرجع التحصيل",
    date: "تاريخ التحصيل",
    record: "تسجيل التحصيل",
    correction: "إضافة تصحيح للتحصيل",
    delta: "فرق المبلغ",
    reason: "رمز السبب",
    openWorkspace: "فتح مساحة تسوية الدفع عند الاستلام",
    success: "تم اعتماد أمر الدفع عند الاستلام الموثوق.",
    replayed: "تمت استعادة الأمر المعتمد سابقًا بأمان.",
    failed: "لم يتم اعتماد الأمر. حدّث الصفحة ثم أعد المحاولة.",
    conflict: "تغيّرت الطلبية. حدّث الصفحة قبل إعادة المحاولة.",
  },
} as const;

function nowLocalInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function stableCommandKey(key: string): string {
  const previous = window.localStorage.getItem(key);
  if (previous && previous.length >= 8) return previous;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function safeInteger(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function CanonicalCodActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.en;
  const [position, setPosition] = useState<CodPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [collection, setCollection] = useState({
    amount: "",
    provider: "manual-courier",
    reference: "",
    collectedAt: nowLocalInput(),
  });
  const [correction, setCorrection] = useState({
    delta: "",
    reason: "provider-statement-corrected",
    occurredAt: nowLocalInput(),
  });

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/orders/${orderId}/cod/position`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          position?: CodPosition;
          error?: string;
        };
        if (!response.ok || !data.position) {
          throw new Error(data.error || copy.unavailable);
        }
        if (cancelled) return;
        setPosition(data.position);
        setCollection((current) => ({
          ...current,
          amount: String(
            data.position?.outstandingCollection ||
              data.position?.expectedReceivable ||
              0,
          ),
          provider: data.position?.provider ?? current.provider,
        }));
        setCorrection((current) => ({
          ...current,
          delta: String(-(data.position?.discrepancy ?? 0)),
        }));
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : copy.unavailable);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [copy.unavailable, orderId]);

  async function commit(
    operation: "collection" | "correction",
    body: Record<string, unknown>,
  ): Promise<void> {
    if (!position) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const storageKey = `sf-order-cod:${operation}:${orderId}:${position.orderVersion}`;
    const idempotencyKey = stableCommandKey(storageKey);
    try {
      const response = await fetch(
        operation === "collection"
          ? `/api/orders/${orderId}/cod/collection`
          : `/api/orders/${orderId}/cod/collection/correction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            expectedVersion: position.orderVersion,
            idempotencyKey,
            correlationId: `order-cod-ui:${idempotencyKey}`,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        command?: { replayed?: boolean };
      };
      if (!response.ok) {
        throw new Error(
          data.code === "CONFLICT"
            ? copy.conflict
            : data.error || copy.failed,
        );
      }
      window.localStorage.removeItem(storageKey);
      setNotice(data.command?.replayed ? copy.replayed : copy.success);
      router.refresh();
      const refreshed = await fetch(`/api/orders/${orderId}/cod/position`, {
        cache: "no-store",
      });
      const refreshedData = (await refreshed.json().catch(() => ({}))) as {
        position?: CodPosition;
      };
      if (refreshedData.position) setPosition(refreshedData.position);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.failed);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{copy.loading}</p>;
  }
  if (!position) {
    return <p role="alert" className="text-sm text-destructive">{error ?? copy.unavailable}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium"><CircleDollarSign className="h-4 w-4" />{copy.title}</p>
          <Badge variant="outline" className="mt-1 gap-1"><Scale className="h-3 w-3" />{copy.authority}</Badge>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/accounting/cod-reconciliation">{copy.openWorkspace}<ExternalLink className="ms-1.5 h-3.5 w-3.5" /></Link>
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {[
          [copy.expected, position.expectedReceivable],
          [copy.collected, position.effectiveCollected],
          [copy.remitted, position.grossRemitted],
          [copy.fees, position.fees],
          [copy.outstanding, position.outstandingCollection + position.outstandingRemittance],
          [copy.discrepancy, position.discrepancy],
        ].map(([label, amount]) => (
          <div key={String(label)} className="rounded-md border bg-muted/20 p-2.5">
            <dt className="text-xs text-muted-foreground">{String(label)}</dt>
            <dd className={`mt-1 font-medium tabular-nums ${label === copy.discrepancy && amount !== 0 ? "text-destructive" : ""}`}>{formatDZD(Number(amount))}</dd>
          </div>
        ))}
      </dl>

      {position.collectedAt ? <p className="text-xs text-muted-foreground">{copy.collected}: {formatDate(position.collectedAt)} · {position.provider ?? "—"} · {position.collectionReference ?? "—"}</p> : null}
      {notice ? <p role="status" className="text-sm text-success">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {!position.collectionId ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{copy.amount}</Label><Input inputMode="numeric" value={collection.amount} onChange={(event) => setCollection((current) => ({ ...current, amount: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{copy.provider}</Label><Input dir="auto" value={collection.provider} onChange={(event) => setCollection((current) => ({ ...current, provider: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{copy.reference}</Label><Input dir="auto" value={collection.reference} onChange={(event) => setCollection((current) => ({ ...current, reference: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{copy.date}</Label><Input type="datetime-local" value={collection.collectedAt} onChange={(event) => setCollection((current) => ({ ...current, collectedAt: event.target.value }))} /></div>
          </div>
          <div className="flex justify-end"><Button disabled={submitting || !collection.provider.trim() || safeInteger(collection.amount) <= 0} onClick={() => void commit("collection", { amount: safeInteger(collection.amount), provider: collection.provider.trim(), reference: collection.reference.trim() || undefined, collectedAt: new Date(collection.collectedAt).toISOString() })}>{submitting ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{copy.record}</Button></div>
        </div>
      ) : position.discrepancy !== 0 ? (
        <div className="space-y-3 rounded-lg border border-warning/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{copy.delta}</Label><Input inputMode="numeric" value={correction.delta} onChange={(event) => setCorrection((current) => ({ ...current, delta: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{copy.reason}</Label><Input dir="auto" value={correction.reason} onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))} /></div>
          </div>
          <div className="flex justify-end"><Button disabled={submitting || safeInteger(correction.delta) === 0 || !correction.reason.trim()} onClick={() => void commit("correction", { amountDelta: safeInteger(correction.delta), reasonCode: correction.reason.trim(), occurredAt: new Date(correction.occurredAt).toISOString() })}>{submitting ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}{copy.correction}</Button></div>
        </div>
      ) : null}
    </div>
  );
}
