import { AlertTriangle, CheckCircle2, Clock3, ReceiptText, Scale } from "lucide-react";

import type { CanonicalCodDashboardSummary } from "@/components/accounting/canonical-cod-dashboard";
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
import { getI18n } from "@/lib/i18n-server";
import { formatDZD, formatDate } from "@/lib/utils";

const COPY = {
  en: {
    expected: "Expected receivable",
    collected: "Collected",
    remitted: "Gross remitted",
    net: "Net received",
    awaitingCollection: "Awaiting collection",
    awaitingRemittance: "Awaiting remittance",
    review: "Reconciliation review",
    recent: "Recent remittance batches",
    order: "Order",
    customer: "Customer",
    provider: "Provider",
    outstanding: "Outstanding",
    reference: "Reference",
    date: "Date",
    state: "State",
    noReview: "No COD discrepancy currently needs review.",
    readonly: "Read-only financial workspace",
  },
  fr: {
    expected: "Créance attendue",
    collected: "Encaissé",
    remitted: "Versement brut",
    net: "Net reçu",
    awaitingCollection: "À encaisser",
    awaitingRemittance: "À verser",
    review: "Contrôle du rapprochement",
    recent: "Versements récents",
    order: "Commande",
    customer: "Client",
    provider: "Transporteur",
    outstanding: "Restant",
    reference: "Référence",
    date: "Date",
    state: "État",
    noReview: "Aucun écart COD ne nécessite de contrôle.",
    readonly: "Espace financier en lecture seule",
  },
  ar: {
    expected: "المستحق المتوقع",
    collected: "المحصّل",
    remitted: "التحويل الإجمالي",
    net: "الصافي المستلم",
    awaitingCollection: "بانتظار التحصيل",
    awaitingRemittance: "بانتظار التحويل",
    review: "مراجعة المطابقة",
    recent: "التحويلات الأخيرة",
    order: "الطلبية",
    customer: "الزبون",
    provider: "شركة التوصيل",
    outstanding: "المتبقي",
    reference: "المرجع",
    date: "التاريخ",
    state: "الحالة",
    noReview: "لا يوجد فرق دفع عند الاستلام يحتاج إلى مراجعة.",
    readonly: "مساحة مالية للقراءة فقط",
  },
} as const;

export async function CanonicalCodReadOnly({
  summary,
}: {
  summary: CanonicalCodDashboardSummary;
}) {
  const { locale } = await getI18n();
  const text = COPY[locale as keyof typeof COPY] ?? COPY.en;
  const reviewCount = summary.reviewLines.length + summary.disputed.length;

  return (
    <div className="space-y-6">
      <StateSurface
        icon={Scale}
        title={text.readonly}
        tone="neutral"
        size="inline"
      />

      <div className="card-grid-4">
        <StatCard label={text.expected} value={formatDZD(summary.totals.expectedReceivable)} icon={<ReceiptText />} />
        <StatCard label={text.collected} value={formatDZD(summary.totals.effectiveCollected)} icon={<CheckCircle2 />} />
        <StatCard label={text.remitted} value={formatDZD(summary.totals.grossRemitted)} icon={<ReceiptText />} />
        <StatCard label={text.net} value={formatDZD(summary.totals.netReceived)} icon={<Scale />} />
        <StatCard label={text.awaitingCollection} value={formatDZD(summary.totals.outstandingCollection)} icon={<Clock3 />} />
        <StatCard label={text.awaitingRemittance} value={formatDZD(summary.totals.outstandingRemittance)} icon={<Clock3 />} />
        <StatCard label={text.review} value={reviewCount} icon={<AlertTriangle />} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{text.review}</CardTitle></CardHeader>
        <CardContent>
          {summary.disputed.length === 0 && summary.reviewLines.length === 0 ? (
            <StateSurface icon={CheckCircle2} title={text.noReview} tone="success" size="inline" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{text.order}</TableHead>
                    <TableHead>{text.customer}</TableHead>
                    <TableHead>{text.provider}</TableHead>
                    <TableHead className="text-end">{text.outstanding}</TableHead>
                    <TableHead>{text.state}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.disputed.map((item) => (
                    <TableRow key={item.orderId}>
                      <TableCell className="font-mono">{item.orderNumber}</TableCell>
                      <TableCell>{item.customerName}</TableCell>
                      <TableCell>{item.provider ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatDZD(item.outstandingRemittance)}</TableCell>
                      <TableCell>{item.codState}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{text.recent}</CardTitle></CardHeader>
        <CardContent>
          {summary.recentSettlements.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{text.provider}</TableHead>
                    <TableHead>{text.reference}</TableHead>
                    <TableHead>{text.date}</TableHead>
                    <TableHead className="text-end">{text.net}</TableHead>
                    <TableHead>{text.state}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recentSettlements.map((settlement) => (
                    <TableRow key={settlement.settlementId}>
                      <TableCell>{settlement.provider}</TableCell>
                      <TableCell className="font-mono">{settlement.externalReference}</TableCell>
                      <TableCell>{formatDate(settlement.receivedAt, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatDZD(settlement.netAmount)}</TableCell>
                      <TableCell>{settlement.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
