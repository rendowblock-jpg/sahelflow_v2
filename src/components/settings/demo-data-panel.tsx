"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Database,
  ExternalLink,
  Loader2,
  MessageSquare,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  Users,
} from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";

type DemoCounts = {
  categories: number;
  products: number;
  customers: number;
  orders: number;
  deliveries: number;
  returns: number;
  refunds: number;
  conversations: number;
  messages: number;
  expenses: number;
};

type DemoStatus = {
  version: string;
  loaded: boolean;
  canSeed: boolean;
  hasBusinessData: boolean;
  createdAt: string | null;
  counts: DemoCounts;
};

type Copy = {
  eyebrow: string;
  title: string;
  description: string;
  isolated: string;
  emptyOnly: string;
  loaded: string;
  available: string;
  unavailable: string;
  unavailableDescription: string;
  load: string;
  loading: string;
  remove: string;
  removing: string;
  openDashboard: string;
  refresh: string;
  confirmRemove: string;
  failed: string;
  products: string;
  customers: string;
  orders: string;
  deliveries: string;
  conversations: string;
  expenses: string;
  journeyTitle: string;
  journey: string;
  note: string;
};

const COPY: Record<"ar" | "fr" | "en", Copy> = {
  ar: {
    eyebrow: "بيانات تجريبية احترافية",
    title: "متجر جزائري واقعي للتجربة",
    description:
      "حمّل مساحة تجريبية غنية تعرض المنتجات، الزبائن، الطلبات، التوصيل، تحصيل COD، المرتجعات، المصاريف ومحادثات واتساب بالعربية والفرنسية.",
    isolated: "لا يتم إرسال رسائل أو طلبات حقيقية إلى شركات التوصيل.",
    emptyOnly: "يمكن إضافة البيانات فقط عندما يكون المتجر الحالي فارغًا.",
    loaded: "البيانات التجريبية محمّلة",
    available: "جاهزة للتحميل",
    unavailable: "المتجر يحتوي على بيانات حقيقية",
    unavailableDescription:
      "لن يخلط SahelFlow البيانات التجريبية مع سجلات البائع. أنشئ متجرًا فارغًا أو استخدم متجرًا بدون عمليات.",
    load: "تحميل المتجر التجريبي",
    loading: "جارٍ إنشاء البيانات...",
    remove: "حذف البيانات التجريبية",
    removing: "جارٍ الحذف...",
    openDashboard: "فتح لوحة التحكم",
    refresh: "تحديث الحالة",
    confirmRemove:
      "سيتم حذف السجلات التجريبية فقط. لن تتأثر أي بيانات أخرى. هل تريد المتابعة؟",
    failed: "تعذر تنفيذ العملية",
    products: "منتج",
    customers: "زبون",
    orders: "طلب",
    deliveries: "شحنة",
    conversations: "محادثة",
    expenses: "مصروف",
    journeyTitle: "القصة الرئيسية",
    journey:
      "رسالة واتساب من فاطمة الزهراء ← استخراج ومراجعة الطلب ← التأكيد ← الشحن مع Yalidine ← التسليم ← تحصيل وتحويل COD مع سجل واضح.",
    note:
      "الأسماء والأرقام والطلبات خيالية ومخصصة للعرض. الأتمتة تعمل في وضع المحاكاة ولا تنفذ تأثيرات خارجية.",
  },
  fr: {
    eyebrow: "Données de démonstration professionnelles",
    title: "Une boutique algérienne réaliste à explorer",
    description:
      "Chargez un espace riche avec produits, clients, commandes, livraison, collecte COD, remises, retours, dépenses et conversations WhatsApp en arabe et en français.",
    isolated: "Aucun message ni ordre réel n'est envoyé à un transporteur.",
    emptyOnly: "Le jeu de données ne peut être ajouté qu'à une boutique vide.",
    loaded: "Démonstration chargée",
    available: "Prête à charger",
    unavailable: "Cette boutique contient déjà des données",
    unavailableDescription:
      "SahelFlow ne mélange jamais la démonstration avec les dossiers du vendeur. Utilisez une boutique vide pour l'évaluation.",
    load: "Charger la boutique de démonstration",
    loading: "Création des données...",
    remove: "Supprimer la démonstration",
    removing: "Suppression...",
    openDashboard: "Ouvrir le tableau de bord",
    refresh: "Actualiser l'état",
    confirmRemove:
      "Seuls les enregistrements de démonstration seront supprimés. Les autres données resteront intactes. Continuer ?",
    failed: "L'opération a échoué",
    products: "produits",
    customers: "clients",
    orders: "commandes",
    deliveries: "livraisons",
    conversations: "conversations",
    expenses: "dépenses",
    journeyTitle: "Scénario phare",
    journey:
      "Message WhatsApp de Fatima Zohra → extraction et revue → confirmation → expédition Yalidine → livraison → collecte et remise COD avec historique explicite.",
    note:
      "Les identités, téléphones et opérations sont fictifs. Les automatisations sont en simulation et n'exécutent aucun effet externe.",
  },
  en: {
    eyebrow: "Professional sample data",
    title: "A realistic Algerian store to explore",
    description:
      "Load a rich workspace with products, customers, orders, delivery, COD collection and remittance, returns, expenses, and Arabic/French WhatsApp conversations.",
    isolated: "No real message, shipment, or provider action is sent.",
    emptyOnly: "The dataset can only be added to an empty shop.",
    loaded: "Demo data loaded",
    available: "Ready to load",
    unavailable: "This shop already contains business data",
    unavailableDescription:
      "SahelFlow never mixes sample records with seller records. Use an empty shop for evaluation.",
    load: "Load Algerian demo store",
    loading: "Creating sample data...",
    remove: "Remove demo data",
    removing: "Removing...",
    openDashboard: "Open dashboard",
    refresh: "Refresh status",
    confirmRemove:
      "Only demo-tagged records will be removed. All other data stays untouched. Continue?",
    failed: "The operation failed",
    products: "products",
    customers: "customers",
    orders: "orders",
    deliveries: "deliveries",
    conversations: "conversations",
    expenses: "expenses",
    journeyTitle: "Flagship story",
    journey:
      "Fatima Zohra WhatsApp message → extraction and review → confirmation → Yalidine shipment → delivery → COD collection and remittance with a clear timeline.",
    note:
      "Names, phone numbers, and operations are fictional. Automations run in dry-run mode and perform no external effects.",
  },
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function requestStatus(signal?: AbortSignal): Promise<DemoStatus> {
  const response = await fetch("/api/demo-data", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DemoStatus;
}

export function DemoDataPanel() {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState<"load" | "remove" | "refresh" | null>(
    "refresh",
  );
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void requestStatus(controller.signal)
      .then((nextStatus) => setStatus(nextStatus))
      .catch((failure: unknown) => {
        if (failure instanceof DOMException && failure.name === "AbortError") return;
        setError(failure instanceof Error ? failure.message : "Status request failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(null);
      });
    return () => controller.abort();
  }, []);

  const refreshStatus = async () => {
    setBusy("refresh");
    setError(null);
    try {
      setStatus(await requestStatus());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : copy.failed);
    } finally {
      setBusy(null);
    }
  };

  const mutate = async (method: "POST" | "DELETE") => {
    setBusy(method === "POST" ? "load" : "remove");
    setError(null);
    try {
      const response = await fetch("/api/demo-data", {
        method,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await readError(response));
      setStatus((await response.json()) as DemoStatus);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : copy.failed);
    } finally {
      setBusy(null);
    }
  };

  const metrics = status
    ? [
        { icon: Package, value: status.counts.products, label: copy.products },
        { icon: Users, value: status.counts.customers, label: copy.customers },
        { icon: ShoppingCart, value: status.counts.orders, label: copy.orders },
        { icon: Truck, value: status.counts.deliveries, label: copy.deliveries },
        {
          icon: MessageSquare,
          value: status.counts.conversations,
          label: copy.conversations,
        },
        { icon: ReceiptText, value: status.counts.expenses, label: copy.expenses },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge variant="outline" className="gap-1.5">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {copy.eyebrow}
              </Badge>
              <CardTitle className="text-xl">{copy.title}</CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6">
                {copy.description}
              </CardDescription>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
              <Database className="size-5" aria-hidden="true" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {status?.loaded ? (
              <Badge className="gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {copy.loaded}
              </Badge>
            ) : status?.canSeed ? (
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {copy.available}
              </Badge>
            ) : status ? (
              <Badge variant="outline">{copy.unavailable}</Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{copy.emptyOnly}</span>
          </div>

          {status?.loaded ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {metrics.map(({ icon: Icon, value, label }) => (
                <div key={label} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="text-xs">{label}</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-md border bg-muted/20 p-4">
            <p className="text-sm font-semibold">{copy.journeyTitle}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {copy.journey}
            </p>
          </div>

          {status && !status.loaded && !status.canSeed ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-4 text-sm">
              <p className="font-medium text-warning">{copy.unavailable}</p>
              <p className="mt-1 text-muted-foreground">
                {copy.unavailableDescription}
              </p>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <span className="font-medium">{copy.failed}: </span>
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!status?.loaded ? (
              <Button
                type="button"
                onClick={() => void mutate("POST")}
                disabled={!status?.canSeed || busy !== null}
              >
                {busy === "load" ? (
                  <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="me-2 size-4" aria-hidden="true" />
                )}
                {busy === "load" ? copy.loading : copy.load}
              </Button>
            ) : null}

            {status?.loaded ? (
              <>
                <Button asChild>
                  <Link href="/dashboard">
                    {copy.openDashboard}
                    <ExternalLink className="ms-2 size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRemoveConfirmOpen(true)}
                  disabled={busy !== null}
                  className="text-destructive hover:text-destructive"
                >
                  {busy === "remove" ? (
                    <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="me-2 size-4" aria-hidden="true" />
                  )}
                  {busy === "remove" ? copy.removing : copy.remove}
                </Button>
              </>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              onClick={() => void refreshStatus()}
              disabled={busy !== null}
            >
              {busy === "refresh" ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {copy.refresh}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {copy.isolated} {copy.note}
            </span>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title={copy.remove}
        description={copy.confirmRemove}
        confirmLabel={copy.remove}
        destructive
        onConfirm={() => mutate("DELETE")}
      />
    </div>
  );
}
