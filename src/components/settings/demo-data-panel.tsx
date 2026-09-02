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
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceCopyKey,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";

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

/** Structured failure from the demo-data API (coded 4xx carry `code`). */
type DemoFailure = {
  message: string;
  code: string | null;
  status: number;
};

/** Panel-facing error: localized primary line + mono technical detail. */
type DemoPanelError = {
  primary: string;
  detail: string | null;
};

/** FD-054: removal fails closed when real records reference demo records. */
const DEMO_REMOVAL_BLOCKED_CODE = "DEMO_REMOVAL_BLOCKED_BY_REFERENCES";

class DemoRequestError extends Error {
  readonly failure: DemoFailure;
  constructor(failure: DemoFailure) {
    super(failure.message);
    this.name = "DemoRequestError";
    this.failure = failure;
  }
}

async function readFailure(response: Response): Promise<DemoFailure> {
  const fallback: DemoFailure = {
    message: `${response.status} ${response.statusText}`,
    code: null,
    status: response.status,
  };
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    if (!body.error && !body.code) return fallback;
    return {
      message: body.error ?? fallback.message,
      code: body.code ?? null,
      status: response.status,
    };
  } catch {
    return fallback;
  }
}

async function requestStatus(signal?: AbortSignal): Promise<DemoStatus> {
  const response = await fetch("/api/demo-data", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new DemoRequestError(await readFailure(response));
  return (await response.json()) as DemoStatus;
}

function extractFailure(caught: unknown): DemoFailure {
  return caught instanceof DemoRequestError
    ? caught.failure
    : {
        message: caught instanceof Error ? caught.message : "",
        code: null,
        status: 0,
      };
}

export function DemoDataPanel() {
  const router = useRouter();
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  // Sibling settings panels (danger zone, connections, …) read their product
  // copy through the settings runtime dictionary — demo data now does too.
  const copy = (key: SettingsWorkspaceCopyKey) =>
    getSettingsWorkspaceCopy(locale, key);
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState<"load" | "remove" | "refresh" | null>(
    "refresh",
  );
  const [failure, setFailure] = useState<DemoFailure | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [loadConfirmOpen, setLoadConfirmOpen] = useState(false);

  // Derived (not stored) so a locale switch re-localizes the primary line;
  // the server code/status stays secondary mono technical detail.
  const error: DemoPanelError | null = failure
    ? {
        primary:
          failure.code === DEMO_REMOVAL_BLOCKED_CODE
            ? copy("demoData.removeBlocked")
            : copy("demoData.actionFailed"),
        detail:
          failure.code ??
          (failure.status > 0 ? `HTTP ${failure.status}` : null),
      }
    : null;

  useEffect(() => {
    const controller = new AbortController();
    void requestStatus(controller.signal)
      .then((nextStatus) => setStatus(nextStatus))
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (!controller.signal.aborted) setFailure(extractFailure(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(null);
      });
    return () => controller.abort();
  }, []);

  const refreshStatus = async () => {
    setBusy("refresh");
    setFailure(null);
    try {
      setStatus(await requestStatus());
    } catch (caught) {
      setFailure(extractFailure(caught));
    } finally {
      setBusy(null);
    }
  };

  const mutate = async (method: "POST" | "DELETE") => {
    setBusy(method === "POST" ? "load" : "remove");
    setFailure(null);
    try {
      const response = await fetch("/api/demo-data", {
        method,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new DemoRequestError(await readFailure(response));
      }
      setStatus((await response.json()) as DemoStatus);
      router.refresh();
    } catch (caught) {
      setFailure(extractFailure(caught));
    } finally {
      setBusy(null);
    }
  };

  const metrics = status
    ? [
        { icon: Package, value: status.counts.products, label: copy("demoData.products") },
        { icon: Users, value: status.counts.customers, label: copy("demoData.customers") },
        { icon: ShoppingCart, value: status.counts.orders, label: copy("demoData.orders") },
        { icon: Truck, value: status.counts.deliveries, label: copy("demoData.deliveries") },
        {
          icon: MessageSquare,
          value: status.counts.conversations,
          label: copy("demoData.conversations"),
        },
        { icon: ReceiptText, value: status.counts.expenses, label: copy("demoData.expenses") },
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
                {copy("demoData.eyebrow")}
              </Badge>
              <CardTitle className="text-xl">{copy("demoData.title")}</CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6">
                {copy("demoData.description")}
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
                {copy("demoData.loaded")}
              </Badge>
            ) : status?.canSeed ? (
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {copy("demoData.available")}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {copy("demoData.coexistNote")}
            </span>
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
            <p className="text-sm font-semibold">{copy("demoData.journeyTitle")}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {copy("demoData.journey")}
            </p>
          </div>

          {status && !status.loaded && status.hasBusinessData ? (
            <div className="rounded-md border bg-muted/20 p-4 text-sm">
              <p className="font-medium">{copy("demoData.withRealData")}</p>
              <p className="mt-1 text-muted-foreground">
                {copy("demoData.withRealDataDescription")}
              </p>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <span className="font-medium">{error.primary}</span>
              {error.detail ? (
                <span
                  dir="ltr"
                  className="mt-1 block font-mono text-xs text-muted-foreground"
                >
                  {error.detail}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!status?.loaded ? (
              <Button
                type="button"
                onClick={() =>
                  status?.hasBusinessData
                    ? setLoadConfirmOpen(true)
                    : void mutate("POST")
                }
                disabled={!status?.canSeed || busy !== null}
              >
                {busy === "load" ? (
                  <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="me-2 size-4" aria-hidden="true" />
                )}
                {busy === "load" ? copy("demoData.loading") : copy("demoData.load")}
              </Button>
            ) : null}

            {status?.loaded ? (
              <>
                <Button asChild>
                  <Link href="/dashboard">
                    {copy("demoData.openDashboard")}
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
                  {busy === "remove" ? copy("demoData.removing") : copy("demoData.remove")}
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
              {copy("demoData.refresh")}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {copy("demoData.isolated")} {copy("demoData.note")}
            </span>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title={copy("demoData.remove")}
        description={copy("demoData.confirmRemove")}
        confirmLabel={copy("demoData.remove")}
        destructive
        onConfirm={() => mutate("DELETE")}
      />

      <ConfirmDialog
        open={loadConfirmOpen}
        onOpenChange={setLoadConfirmOpen}
        title={copy("demoData.confirmLoadTitle")}
        description={copy("demoData.confirmLoad")}
        confirmLabel={copy("demoData.load")}
        onConfirm={() => mutate("POST")}
      />
    </div>
  );
}
