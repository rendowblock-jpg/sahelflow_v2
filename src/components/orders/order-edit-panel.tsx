"use client";

/**
 * OrderEditPanel — inline edit mode for the order detail page.
 *
 * Wraps the order detail page sections (items, delivery info, notes) and
 * makes them editable when the user clicks "Edit". On save, PATCHes the
 * order via /api/orders/[id].
 *
 * Pattern: Linear/Notion inline edit toggle (View ↔ Edit on same page).
 * The toggle is a button in the page header. When in edit mode, all editable
 * fields become inputs; when not, they render as read-only display.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mutatePrefix } from "@/lib/swr/mutate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { formatDZD } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import { toast } from "@/lib/toast";
import { localizeServerMessage } from "@/lib/i18n/localize-server-message";
import { manualOrderRequestFingerprint } from "@/lib/orders/manual-order-command-key";
import { OrderLinesEditor } from "@/components/orders/order-lines-editor";
import {
  linesCommandPayload,
  linesDiffer,
  linesFromItems,
  linesItemsTotal,
  type EditableLine,
  type PanelItem,
} from "@/components/orders/order-lines-edit";
import {
  fetchProductOptions,
  type OrderFormProduct,
} from "@/components/orders/order-product-combobox";

interface OrderItem {
  id: string;
  productId: string | null;
  productVariantId?: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface OrderEditPanelProps {
  orderId: string;
  readOnly?: boolean;
  /**
   * Set for a PENDING canonical order: the panel then edits only the delivery
   * destination, phone, notes and delivery fee, through the governed command
   * (POST /api/orders/[id]/edit), with this as the version it was opened on.
   * The order lines stay read-only; they are not governed by that command.
   */
  canonicalVersion?: number;
  /**
   * Set for a pending order the seller typed in: its lines can then be corrected (quantity,
   * price, remove, add a product) through POST /api/orders/[id]/lines. Not set for a hosted
   * storefront order or any other canonical order, whose lines stay read-only.
   */
  linesEditable?: boolean;
  initialItems: OrderItem[];
  initialDeliveryCost: number;
  initialWilaya: string;
  initialCommune: string;
  initialAddress: string;
  initialPhone: string;
  initialNotes: string | null;
  /** Children = the read-only view (rendered when not in edit mode) */
  children: React.ReactNode;
}

export function OrderEditPanel({
  orderId,
  readOnly = false,
  canonicalVersion,
  linesEditable = false,
  initialItems,
  initialDeliveryCost,
  initialWilaya,
  initialCommune,
  initialAddress,
  initialPhone,
  initialNotes,
  children,
}: OrderEditPanelProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canonical = canonicalVersion !== undefined;

  // Editable state
  const [items, setItems] = useState(initialItems);
  const panelItems = useMemo<PanelItem[]>(
    () => initialItems.map((item) => ({ ...item, productVariantId: item.productVariantId ?? null })),
    [initialItems],
  );
  const [lines, setLines] = useState<EditableLine[]>(() => linesFromItems(panelItems));
  const [catalog, setCatalog] = useState<OrderFormProduct[]>([]);
  const newLineCounter = useRef(0);
  const nextLineKey = useCallback(() => `new:${++newLineCounter.current}`, []);
  const registerCatalog = useCallback((fetched: OrderFormProduct[]) => {
    setCatalog((previous) => {
      const known = new Set(previous.map((product) => product.id));
      const additions = fetched.filter((product) => !known.has(product.id));
      return additions.length ? [...previous, ...additions] : previous;
    });
  }, []);
  useEffect(() => {
    if (!isEditing || !linesEditable || catalog.length > 0) return;
    let cancelled = false;
    void fetchProductOptions("")
      .then((products) => {
        if (!cancelled) registerCatalog(products);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isEditing, linesEditable, catalog.length, registerCatalog]);
  const [deliveryCost, setDeliveryCost] = useState(String(initialDeliveryCost));
  const [wilaya, setWilaya] = useState(initialWilaya);
  const [commune, setCommune] = useState(initialCommune);
  const [address, setAddress] = useState(initialAddress);
  const [phone, setPhone] = useState(initialPhone);
  const [notes, setNotes] = useState(initialNotes ?? "");

  function startEdit() {
    setIsEditing(true);
  }

  function cancelEdit() {
    // Reset to initial values
    setItems(initialItems);
    setLines(linesFromItems(panelItems));
    setDeliveryCost(String(initialDeliveryCost));
    setWilaya(initialWilaya);
    setCommune(initialCommune);
    setAddress(initialAddress);
    setPhone(initialPhone);
    setNotes(initialNotes ?? "");
    setIsEditing(false);
  }

  function updateItem(index: number, field: "quantity" | "unitPrice", value: number) {
    setItems(items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      updated.total = updated.quantity * updated.unitPrice;
      return updated;
    }));
  }

  async function saveEdit() {
    startTransition(async () => {
      try {
        let res: Response;
        if (canonical) {
          // Governed edit: send only what changed. The key is derived from the
          // order, the version and the exact request, so a retry of the same
          // save replays instead of writing twice, and a different save at the
          // same version cannot reuse it.
          const changes: Record<string, unknown> = {};
          const strip = (value: string) => value.replace(/\s+/g, "");
          if (wilaya !== initialWilaya) changes.wilaya = wilaya;
          if (commune !== initialCommune) changes.commune = commune;
          if (address !== initialAddress) changes.address = address;
          if (strip(phone) !== strip(initialPhone)) changes.phone = phone;
          const nextCost = parseInt(deliveryCost) || 0;
          if (nextCost !== initialDeliveryCost) changes.deliveryCost = nextCost;
          if (notes !== (initialNotes ?? "")) changes.notes = notes || null;
          const linesChanged = linesEditable && linesDiffer(panelItems, lines);
          const fieldsChanged = Object.keys(changes).length > 0;
          if (!linesChanged && !fieldsChanged) {
            setIsEditing(false);
            return;
          }
          let version = canonicalVersion;
          let last: Response | null = null;
          if (linesChanged) {
            // The items first: the other fields follow at the version this save answers.
            const payload = linesCommandPayload(panelItems, lines);
            const linesJson = JSON.stringify({ expectedVersion: version, lines: payload });
            const linesKey = `order-lines-${orderId}-v${version}-${manualOrderRequestFingerprint(linesJson)}`;
            last = await fetch(`/api/orders/${orderId}/lines`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expectedVersion: version,
                lines: payload,
                idempotencyKey: linesKey,
                correlationId: `order-lines-ui:${linesKey}`,
              }),
            });
            if (last.ok && fieldsChanged) {
              const saved = (await last.json().catch(() => ({}))) as { order?: { version?: number } };
              version = saved.order?.version ?? (version ?? 0) + 1;
            }
          }
          if (fieldsChanged && (last === null || last.ok)) {
            const requestJson = JSON.stringify({
              expectedVersion: version,
              ...changes,
            });
            const idempotencyKey = `order-edit-${orderId}-v${version}-${manualOrderRequestFingerprint(requestJson)}`;
            last = await fetch(`/api/orders/${orderId}/edit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...changes,
                expectedVersion: version,
                idempotencyKey,
                correlationId: `order-edit-ui:${idempotencyKey}`,
              }),
            });
            if (linesChanged && !last.ok) {
              // The items are saved and the order moved on: show what really is stored.
              toast.error(t("orders.detail.editPartial"));
              setIsEditing(false);
              router.refresh();
              void mutatePrefix("/api/orders");
              return;
            }
          }
          res = last as Response;
        } else {
          // B7-1: totalPrice is server-derived money truth — the PATCH body
          // sends only the inputs (items + deliveryCost) it is derived from.
          res = await fetch(`/api/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map((i) => ({
                id: i.id,
                productId: i.productId,
                productName: i.productName,
                productVariantName: i.productVariantName,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.total,
              })),
              deliveryCost: parseInt(deliveryCost) || 0,
              wilaya,
              commune,
              address,
              phone,
              notes: notes || null,
            }),
          });
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (canonical && data.code === "CONFLICT") {
            // Shown as is: the generic translator below would replace an
            // already translated sentence with "Failed to save".
            toast.error(t("orders.detail.editConflict"));
            return;
          }
          throw new Error(data.error ?? t("orders.detail.editFailed"));
        }

        toast.success(t("orders.detail.editSaved"));
        setIsEditing(false);
        router.refresh();
        // Invalidate SWR cache for /api/orders* so list/table views reflect the edit.
        void mutatePrefix("/api/orders");
      } catch (err) {
        toast.error(
          translateServerError(
            err instanceof Error ? localizeServerMessage(err.message) : "",
            t,
            t("orders.detail.editFailed"),
          ),
        );
      }
    });
  }

  // Read-only mode: render children (the original detail page content)
  if (readOnly) {
    return <>{children}</>;
  }

  if (!isEditing) {
    return (
      <>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("orders.detail.edit")}
          </Button>
        </div>
        {children}
      </>
    );
  }

  // Edit mode: render editable fields
  const itemsTotal = linesEditable
    ? linesItemsTotal(lines)
    : items.reduce((sum, i) => sum + i.total, 0);
  const total = itemsTotal + (parseInt(deliveryCost) || 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cancelEdit} disabled={isPending}>
          <X className="h-3.5 w-3.5" />
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={saveEdit} disabled={isPending}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {t("common.save")}
        </Button>
      </div>

      {/* Editable items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.detail.items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {linesEditable ? (
            <OrderLinesEditor
              lines={lines}
              onChange={setLines}
              products={catalog}
              onProductsLoaded={registerCatalog}
              nextKey={nextLineKey}
              disabled={isPending}
            />
          ) : items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b last:border-0">
              <div className="flex-1 space-y-0.5">
                <p className="text-sm font-medium">{item.productName}</p>
                {item.productVariantName && (
                  <p className="text-xs text-muted-foreground">{item.productVariantName}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canonical ? (
                  <>
                    <div className="text-sm tabular-nums text-muted-foreground">
                      {item.quantity} × {formatDZD(item.unitPrice, locale)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("orders.detail.qty")}</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)}
                        className="w-16 h-8 text-sm tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("orders.detail.price")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(i, "unitPrice", parseInt(e.target.value) || 0)}
                        className="w-24 h-8 text-sm tabular-nums"
                      />
                    </div>
                  </>
                )}
                <div className="text-sm font-medium w-24 text-end tabular-nums">
                  {formatDZD(item.total, locale)}
                </div>
              </div>
            </div>
          ))}
          <Separator />
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("orders.detail.subtotal")}</span>
              <span className="tabular-nums">{formatDZD(itemsTotal, locale)}</span>
            </div>
            <div className="flex justify-between items-center text-sm gap-3">
              <span className="text-muted-foreground">{t("orders.detail.shipping")}</span>
              <Input
                type="number"
                min="0"
                value={deliveryCost}
                onChange={(e) => setDeliveryCost(e.target.value)}
                className="w-24 h-8 text-sm tabular-nums text-end"
              />
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>{t("orders.total")}</span>
              <span className="tabular-nums">{formatDZD(total, locale)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable delivery info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.form.delivery")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("orders.wilaya")}</Label>
              <Input value={wilaya} onChange={(e) => setWilaya(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("orders.commune")}</Label>
              <Input value={commune} onChange={(e) => setCommune(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("customers.address")}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("customers.phone")}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Editable notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.notes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("orders.notesPlaceholder")}
            rows={3}
          />
        </CardContent>
      </Card>
    </div>
  );
}
