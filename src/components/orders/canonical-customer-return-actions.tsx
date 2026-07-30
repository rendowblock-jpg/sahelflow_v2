"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  PackageCheck,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import useSWR from "swr";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import { formatDZD } from "@/lib/utils";
import {
  RETURN_COPY,
  type CatalogProduct,
  type CustomerReturnPosition,
  type ExchangeDraftLine,
  type ReturnAction,
  type ReturnDisposition,
} from "@/components/orders/canonical-customer-return-ui";

type DialogMode = "request" | "transition" | "refund" | "reverse" | null;
type RefundMethod = "cash" | "bank" | "credit" | "courier_deduction";

const TRANSITION_ICON = {
  approve: CheckCircle2,
  reject: XCircle,
  cancel: XCircle,
  mark_in_transit: RotateCcw,
  receive: PackageCheck,
  inspect: PackageCheck,
  complete: CheckCircle2,
} as const;

async function fetchPosition(url: string): Promise<CustomerReturnPosition> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("return-position-failed");
  const body = (await response.json()) as { position: CustomerReturnPosition };
  return body.position;
}

async function fetchProducts(url: string): Promise<CatalogProduct[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("catalog-load-failed");
  const body = (await response.json()) as { products: CatalogProduct[] };
  return body.products;
}

function positiveInteger(value: string): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value: string): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function newExchangeLine(): ExchangeDraftLine {
  return {
    key: crypto.randomUUID(),
    productId: "",
    productVariantId: "",
    quantity: "1",
  };
}

export function CanonicalCustomerReturnActions({
  orderId,
}: {
  orderId: string;
}) {
  const { locale } = useI18n();
  const copy = RETURN_COPY[locale];
  const router = useRouter();
  const {
    data: position,
    error: positionError,
    isLoading,
    mutate,
  } = useSWR(`/api/orders/${orderId}/customer-return`, fetchPosition, {
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const [dialog, setDialog] = useState<DialogMode>(null);
  const [transitionAction, setTransitionAction] =
    useState<Exclude<ReturnAction, "request"> | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [caseType, setCaseType] = useState<"return" | "exchange">("return");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>(
    {},
  );
  const [exchangeLines, setExchangeLines] = useState<ExchangeDraftLine[]>([]);
  const [exchangeDeliveryCost, setExchangeDeliveryCost] = useState("0");
  const [dispositions, setDispositions] = useState<
    Record<string, ReturnDisposition | "">
  >({});
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("cash");
  const [refundReference, setRefundReference] = useState("");
  const [includeDeliveryCost, setIncludeDeliveryCost] = useState(false);
  const [selectedRefundId, setSelectedRefundId] = useState<string | null>(null);
  const [reversalAmount, setReversalAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: catalog = [], error: catalogError } = useSWR(
    dialog === "request" && caseType === "exchange"
      ? "/api/products?activeOnly=true&limit=100"
      : null,
    fetchProducts,
    { revalidateOnFocus: false },
  );

  const selectedRefund = position?.refunds.find(
    (refund) => refund.refundId === selectedRefundId,
  );
  const currentCase = position?.returnCase;
  const itemRefundMaximum = currentCase
    ? Math.max(0, currentCase.itemValue - currentCase.effectiveRefundAmount)
    : 0;
  const refundMaximum = currentCase
    ? includeDeliveryCost
      ? currentCase.remainingItemRefundableAmount
      : itemRefundMaximum
    : 0;

  const inspectionComplete = useMemo(
    () =>
      currentCase?.requestedItems.every(
        (item) =>
          dispositions[item.orderItemId] !== undefined &&
          dispositions[item.orderItemId] !== "",
      ) ?? false,
    [currentCase, dispositions],
  );

  function commandStorageKey(scope: string): string {
    return `sf-customer-return:${orderId}:${position?.orderVersion ?? "unknown"}:${scope}`;
  }

  function commandKey(scope: string): string {
    const storageKey = commandStorageKey(scope);
    const stored = window.localStorage.getItem(storageKey);
    if (stored && stored.length >= 8) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  }

  function resetFeedback(): void {
    setNotice(null);
    setError(null);
  }

  function openRequest(): void {
    if (!position) return;
    setReturnQuantities(
      Object.fromEntries(position.orderItems.map((item) => [item.orderItemId, "0"])),
    );
    setCaseType("return");
    setExchangeLines([]);
    setExchangeDeliveryCost("0");
    setReasonCode("");
    resetFeedback();
    setDialog("request");
  }

  function openTransition(action: Exclude<ReturnAction, "request">): void {
    setTransitionAction(action);
    setReasonCode("");
    if (action === "inspect" && currentCase) {
      setDispositions(
        Object.fromEntries(
          currentCase.requestedItems.map((item) => [item.orderItemId, ""]),
        ),
      );
    }
    resetFeedback();
    setDialog("transition");
  }

  function openRefund(): void {
    setRefundAmount(String(Math.max(0, itemRefundMaximum)));
    setRefundMethod("cash");
    setRefundReference("");
    setIncludeDeliveryCost(false);
    setReasonCode("");
    resetFeedback();
    setDialog("refund");
  }

  function openReversal(refundId: string, maximum: number): void {
    setSelectedRefundId(refundId);
    setReversalAmount(String(maximum));
    setReasonCode("");
    resetFeedback();
    setDialog("reverse");
  }

  async function postCommand(
    url: string,
    payload: Readonly<Record<string, unknown>>,
    scope: string,
  ): Promise<void> {
    const idempotencyKey = commandKey(scope);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey,
          correlationId: `customer-return-ui:${idempotencyKey}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          body.code === "CONFLICT"
            ? copy.conflict
            : body.code === "VALIDATION_ERROR"
              ? copy.invalid
              : copy.failed;
        throw new Error(message);
      }
      window.localStorage.removeItem(commandStorageKey(scope));
      setDialog(null);
      setNotice(body.command?.replayed ? copy.replayed : copy.committed);
      await mutate();
      await mutatePrefix("/api/orders");
      await mutatePrefix("/api/returns");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest(): Promise<void> {
    if (!position || !reasonCode.trim()) {
      setError(copy.invalid);
      return;
    }
    const items = position.orderItems.flatMap((item) => {
      const quantity = positiveInteger(returnQuantities[item.orderItemId] ?? "0");
      return quantity ? [{ orderItemId: item.orderItemId, quantity }] : [];
    });
    if (items.length === 0) {
      setError(copy.invalid);
      return;
    }
    const exchangeDelivery = nonNegativeInteger(exchangeDeliveryCost);
    if (exchangeDelivery === null) {
      setError(copy.invalid);
      return;
    }

    const exchangeItems =
      caseType === "exchange"
        ? exchangeLines.map((line) => {
            const product = catalog.find((entry) => entry.id === line.productId);
            const activeVariants =
              product?.productVariants.filter((variant) => variant.isActive) ?? [];
            const quantity = positiveInteger(line.quantity);
            if (
              !product ||
              !quantity ||
              (activeVariants.length > 0 && !line.productVariantId)
            ) {
              throw new Error(copy.invalid);
            }
            return {
              productId: product.id,
              productVariantId: line.productVariantId || null,
              quantity,
            };
          })
        : undefined;
    if (caseType === "exchange" && (!exchangeItems || exchangeItems.length === 0)) {
      setError(copy.invalid);
      return;
    }

    await postCommand(
      `/api/orders/${orderId}/customer-return`,
      {
        expectedVersion: position.orderVersion,
        caseType,
        reasonCode: reasonCode.trim(),
        items,
        exchangeItems,
        exchangeDeliveryCost: caseType === "exchange" ? exchangeDelivery : 0,
        occurredAt: new Date().toISOString(),
      },
      `request:${caseType}`,
    );
  }

  async function submitTransition(): Promise<void> {
    if (!position || !currentCase || !transitionAction || !reasonCode.trim()) {
      setError(copy.invalid);
      return;
    }
    if (transitionAction === "inspect" && !inspectionComplete) {
      setError(copy.invalid);
      return;
    }
    await postCommand(
      `/api/orders/${orderId}/customer-return/${currentCase.id}/transition`,
      {
        action: transitionAction,
        expectedVersion: position.orderVersion,
        reasonCode: reasonCode.trim(),
        occurredAt: new Date().toISOString(),
        items:
          transitionAction === "inspect"
            ? currentCase.requestedItems.map((item) => ({
                orderItemId: item.orderItemId,
                quantity: item.requestedQuantity,
                disposition: dispositions[item.orderItemId],
              }))
            : undefined,
      },
      `transition:${currentCase.id}:${transitionAction}`,
    );
  }

  async function submitRefund(): Promise<void> {
    if (!position || !currentCase || !reasonCode.trim()) {
      setError(copy.invalid);
      return;
    }
    const amount = positiveInteger(refundAmount);
    if (
      !amount ||
      amount > refundMaximum ||
      (["bank", "courier_deduction"].includes(refundMethod) &&
        !refundReference.trim())
    ) {
      setError(copy.invalid);
      return;
    }
    await postCommand(
      `/api/orders/${orderId}/refunds`,
      {
        returnId: currentCase.id,
        expectedVersion: position.orderVersion,
        amount,
        method: refundMethod,
        reasonCode: reasonCode.trim(),
        reference: refundReference.trim() || undefined,
        includeDeliveryCost,
        occurredAt: new Date().toISOString(),
      },
      `refund:${currentCase.id}:${refundMethod}:${amount}`,
    );
  }

  async function submitReversal(): Promise<void> {
    if (!position || !selectedRefund || !reasonCode.trim()) {
      setError(copy.invalid);
      return;
    }
    const amount = positiveInteger(reversalAmount);
    if (!amount || amount > selectedRefund.effectiveAmount) {
      setError(copy.invalid);
      return;
    }
    await postCommand(
      `/api/orders/${orderId}/refunds/${selectedRefund.refundId}/reverse`,
      {
        expectedVersion: position.orderVersion,
        amount,
        reasonCode: reasonCode.trim(),
        occurredAt: new Date().toISOString(),
      },
      `reverse:${selectedRefund.refundId}:${amount}`,
    );
  }

  if (isLoading && !position) {
    return <p className="text-sm text-muted-foreground">{copy.loading}</p>;
  }
  if (positionError || !position) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {copy.loadFailed}
      </p>
    );
  }

  const canRefund =
    currentCase !== null &&
    ["inspected", "completed"].includes(currentCase.currentState) &&
    currentCase.remainingItemRefundableAmount > 0;

  return (
    <div className="space-y-5 border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{copy.heading}</p>
          <Badge variant="outline" className="mt-1">
            {copy.authority}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {position.availableActions.map((action) => {
            if (action === "request") {
              return (
                <Button key={action} size="sm" variant="outline" onClick={openRequest}>
                  <RotateCcw className="me-1.5 h-4 w-4" />
                  {copy.request}
                </Button>
              );
            }
            const Icon = TRANSITION_ICON[action];
            return (
              <Button
                key={action}
                size="sm"
                variant={["reject", "cancel"].includes(action) ? "destructive" : "outline"}
                onClick={() => openTransition(action)}
              >
                <Icon className="me-1.5 h-4 w-4" />
                {copy[action]}
              </Button>
            );
          })}
          {canRefund ? (
            <Button size="sm" variant="outline" onClick={openRefund}>
              <CircleDollarSign className="me-1.5 h-4 w-4" />
              {copy.refund}
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{copy.state}</dt>
          <dd className="font-medium" dir="auto">
            {position.returnState ?? "none"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.refundState}</dt>
          <dd className="font-medium" dir="auto">
            {position.refundState ?? "none"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.refunded}</dt>
          <dd className="font-medium tabular-nums">
            {formatDZD(position.effectiveRefundAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.refundable}</dt>
          <dd className="font-medium tabular-nums">
            {formatDZD(position.remainingOrderRefundableAmount)}
          </dd>
        </div>
      </dl>

      {currentCase ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge>{currentCase.caseType === "exchange" ? copy.exchange : copy.return}</Badge>
              <span className="text-sm font-medium" dir="auto">
                {currentCase.currentState}
              </span>
            </div>
            {currentCase.replacementOrderId ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/orders/${currentCase.replacementOrderId}`}>
                  {copy.openReplacement}
                  <ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {copy.requestedItems}
            </p>
            <div className="mt-2 space-y-2">
              {currentCase.requestedItems.map((item) => (
                <div
                  key={item.orderItemId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate" dir="auto">
                    {item.productName}
                    {item.variantName ? ` · ${item.variantName}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {item.requestedQuantity}/{item.purchasedQuantity} · {formatDZD(item.unitPrice)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">{copy.refunds}</p>
        {position.refunds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.noRefunds}</p>
        ) : (
          position.refunds.map((refund) => (
            <div
              key={refund.refundId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div>
                <p className="font-medium tabular-nums">
                  {copy.issued}: {formatDZD(refund.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {copy.reversed}: {formatDZD(refund.reversedAmount)} · {copy.effective}: {formatDZD(refund.effectiveAmount)}
                </p>
              </div>
              {refund.canReverse ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openReversal(refund.refundId, refund.effectiveAmount)}
                >
                  <Undo2 className="me-1.5 h-4 w-4" />
                  {copy.reverse}
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {position.availableActions.length === 0 && !canRefund && !currentCase ? (
        <p className="text-sm text-muted-foreground">{copy.noAction}</p>
      ) : null}
      {notice ? <p className="text-sm text-success" role="status">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <AlertDialog open={dialog === "request"} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.request}</AlertDialogTitle>
            <AlertDialogDescription>{copy.authority}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customer-return-type">{copy.caseType}</Label>
                <select
                  id="customer-return-type"
                  value={caseType}
                  onChange={(event) => {
                    const next = event.target.value as "return" | "exchange";
                    setCaseType(next);
                    setExchangeLines(next === "exchange" ? [newExchangeLine()] : []);
                  }}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="return">{copy.returnCase}</option>
                  <option value="exchange">{copy.exchangeCase}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-return-reason">{copy.reason}</Label>
                <Input
                  id="customer-return-reason"
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                  placeholder={copy.reasonPlaceholder}
                  dir="auto"
                />
              </div>
            </div>

            <div className="space-y-2">
              {position.orderItems.map((item) => (
                <div
                  key={item.orderItemId}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_140px] sm:items-end"
                >
                  <div>
                    <p className="text-sm font-medium" dir="auto">
                      {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {copy.purchased}: {item.quantity} · {copy.unitPrice}: {formatDZD(item.unitPrice)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`return-quantity-${item.orderItemId}`} className="text-xs">
                      {copy.quantity}
                    </Label>
                    <Input
                      id={`return-quantity-${item.orderItemId}`}
                      type="number"
                      min={0}
                      max={item.quantity}
                      step={1}
                      value={returnQuantities[item.orderItemId] ?? "0"}
                      onChange={(event) =>
                        setReturnQuantities((current) => ({
                          ...current,
                          [item.orderItemId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            {caseType === "exchange" ? (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{copy.exchangeItems}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setExchangeLines((current) => [...current, newExchangeLine()])}
                  >
                    <Plus className="me-1.5 h-4 w-4" />
                    {copy.addReplacement}
                  </Button>
                </div>
                {catalogError ? (
                  <p className="text-sm text-destructive">{copy.loadFailed}</p>
                ) : null}
                {exchangeLines.map((line) => {
                  const product = catalog.find((entry) => entry.id === line.productId);
                  const variants = product?.productVariants.filter((variant) => variant.isActive) ?? [];
                  return (
                    <div key={line.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{copy.product}</Label>
                        <select
                          value={line.productId}
                          onChange={(event) =>
                            setExchangeLines((current) =>
                              current.map((entry) =>
                                entry.key === line.key
                                  ? { ...entry, productId: event.target.value, productVariantId: "" }
                                  : entry,
                              ),
                            )
                          }
                          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">{copy.chooseProduct}</option>
                          {catalog.map((entry) => (
                            <option key={entry.id} value={entry.id}>{entry.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{copy.variant}</Label>
                        <select
                          value={line.productVariantId}
                          onChange={(event) =>
                            setExchangeLines((current) =>
                              current.map((entry) =>
                                entry.key === line.key
                                  ? { ...entry, productVariantId: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          disabled={!product || variants.length === 0}
                          className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                        >
                          <option value="">
                            {variants.length > 0 ? copy.chooseVariant : copy.noVariant}
                          </option>
                          {variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>{variant.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{copy.quantity}</Label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(event) =>
                            setExchangeLines((current) =>
                              current.map((entry) =>
                                entry.key === line.key
                                  ? { ...entry, quantity: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={exchangeLines.length === 1}
                          onClick={() =>
                            setExchangeLines((current) =>
                              current.filter((entry) => entry.key !== line.key),
                            )
                          }
                        >
                          <Trash2 className="me-1.5 h-4 w-4" />
                          {copy.remove}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <div className="space-y-1.5">
                  <Label htmlFor="exchange-delivery-cost">{copy.exchangeDelivery}</Label>
                  <Input
                    id="exchange-delivery-cost"
                    type="number"
                    min={0}
                    step={1}
                    value={exchangeDeliveryCost}
                    onChange={(event) => setExchangeDeliveryCost(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{copy.cancelDialog}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void submitRequest();
              }}
            >
              {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
              {copy.commit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "transition"} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {transitionAction ? copy[transitionAction] : copy.heading}
            </AlertDialogTitle>
            <AlertDialogDescription>{copy.authority}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="return-transition-reason">{copy.reason}</Label>
              <Input
                id="return-transition-reason"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                placeholder={copy.reasonPlaceholder}
                dir="auto"
              />
            </div>
            {transitionAction === "inspect" && currentCase ? (
              <div className="space-y-2">
                {currentCase.requestedItems.map((item) => (
                  <div key={item.orderItemId} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_180px] sm:items-end">
                    <div>
                      <p className="text-sm font-medium" dir="auto">
                        {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">× {item.requestedQuantity}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{copy.disposition}</Label>
                      <select
                        value={dispositions[item.orderItemId] ?? ""}
                        onChange={(event) =>
                          setDispositions((current) => ({
                            ...current,
                            [item.orderItemId]: event.target.value as ReturnDisposition | "",
                          }))
                        }
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">{copy.chooseDisposition}</option>
                        <option value="available">{copy.available}</option>
                        <option value="damaged">{copy.damaged}</option>
                        <option value="quarantine">{copy.quarantine}</option>
                        <option value="lost">{copy.lost}</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{copy.cancelDialog}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !reasonCode.trim() || (transitionAction === "inspect" && !inspectionComplete)}
              onClick={(event) => {
                event.preventDefault();
                void submitTransition();
              }}
            >
              {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
              {copy.commit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "refund"} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.refund}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.maximum}: {formatDZD(refundMaximum)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">{copy.amount}</Label>
                <Input id="refund-amount" type="number" min={1} max={refundMaximum} step={1} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-method">{copy.method}</Label>
                <select id="refund-method" value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as RefundMethod)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="cash">{copy.cash}</option>
                  <option value="bank">{copy.bank}</option>
                  <option value="credit">{copy.credit}</option>
                  <option value="courier_deduction">{copy.courier_deduction}</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">{copy.reason}</Label>
              <Input id="refund-reason" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} placeholder={copy.reasonPlaceholder} dir="auto" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reference">{copy.reference}</Label>
              <Input id="refund-reference" value={refundReference} onChange={(event) => setRefundReference(event.target.value)} placeholder={copy.referencePlaceholder} dir="auto" />
            </div>
            {currentCase?.fullOrderReturn ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeDeliveryCost} onCheckedChange={(value) => setIncludeDeliveryCost(value === true)} />
                {copy.includeDelivery}
              </label>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{copy.cancelDialog}</AlertDialogCancel>
            <AlertDialogAction disabled={busy || refundMaximum <= 0} onClick={(event) => { event.preventDefault(); void submitRefund(); }}>
              {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
              {copy.commit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "reverse"} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.reverse}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.maximum}: {formatDZD(selectedRefund?.effectiveAmount ?? 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reversal-amount">{copy.amount}</Label>
              <Input id="reversal-amount" type="number" min={1} max={selectedRefund?.effectiveAmount ?? 0} step={1} value={reversalAmount} onChange={(event) => setReversalAmount(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reversal-reason">{copy.reason}</Label>
              <Input id="reversal-reason" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} placeholder={copy.reasonPlaceholder} dir="auto" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{copy.cancelDialog}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void submitReversal(); }}>
              {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
              {copy.commit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
