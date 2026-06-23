"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart, Loader2 } from "lucide-react";
import { formatDZD } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import wilayasData from "../../../data/wilayas.json";
// communes.json (197KB, 1,541 entries) is fetched from /api/communes?wilaya=X
// when the user selects a wilaya — keeps it out of the client bundle (T-019).

interface Customer {
  id: string;
  name: string;
  phone: string;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
}

interface OrderFormItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface Wilaya {
  code: number;
  name: string;
  nameAr: string;
  zone: string;
}

interface Commune {
  code: number;
  wilayaCode: number;
  name: string;
  nameAr: string;
}

interface OrderFormDialogProps {
  customers: Customer[];
  products: Product[];
}

export function OrderFormDialog({ customers, products }: OrderFormDialogProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<OrderFormItem[]>([]);
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("600");

  const wilayas = wilayasData as Wilaya[];
  // Fetch communes for the selected wilaya from the API (T-019: was importing
  // 197KB communes.json into the client bundle). Now fetches ~2KB per wilaya.
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [communesLoading, setCommunesLoading] = useState(false);
  const wilayaCode = wilayas.find((w) => w.name === wilaya)?.code;

  useEffect(() => {
    if (!wilayaCode) return; // no wilaya selected — keep existing communes (cleared by render logic)

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: set loading before async fetch
    setCommunesLoading(true);
    fetch(`/api/communes?wilaya=${wilayaCode}`)
      .then((res) => (res.ok ? res.json() : { communes: [] }))
      .then((data) => {
        if (!cancelled) setCommunes(data.communes ?? []);
      })
      .catch(() => {
        if (!cancelled) setCommunes([]);
      })
      .finally(() => {
        if (!cancelled) setCommunesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wilayaCode]);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  const total = useMemo(() => {
    const itemsTotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const delivery = parseInt(deliveryCost) || 0;
    return itemsTotal + delivery;
  }, [items, deliveryCost]);

  function addProduct(productId: string) {
    const product = activeProducts.find((p) => p.id === productId);
    if (!product) return;
    if (items.some((i) => i.productId === productId)) return; // already added
    setItems([
      ...items,
      {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
      },
    ]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateQuantity(index: number, quantity: number) {
    if (quantity < 1) return;
    setItems(items.map((item, i) => (i === index ? { ...item, quantity } : item)));
  }

  function selectCustomer(id: string) {
    setCustomerId(id);
    // Auto-fill delivery info from customer
    const customer = customers.find((c) => c.id === id);
    if (customer) {
      setWilaya(customer.wilaya ?? "");
      setCommune(customer.commune ?? "");
      setAddress(customer.address ?? "");
      setPhone(customer.phone);
    }
  }

  async function handleSubmit() {
    setError(null);

    if (!customerId) {
      setError(t("orders.form.errorNoCustomer"));
      return;
    }
    if (items.length === 0) {
      setError(t("orders.form.errorNoItems"));
      return;
    }
    if (!wilaya || !commune || !address || !phone) {
      setError(t("orders.form.errorMissingDelivery"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          items: items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          wilaya,
          commune,
          address,
          phone,
          source: "manual",
          deliveryCost: parseInt(deliveryCost) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t("orders.form.createFailed"));
      }

      const { order } = await res.json();
      setOpen(false);
      resetForm();
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setCustomerId("");
    setItems([]);
    setWilaya("");
    setCommune("");
    setAddress("");
    setPhone("");
    setDeliveryCost("600");
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {t("orders.newOrder")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {t("orders.newOrder")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Customer selection */}
          <div className="space-y-2">
            <Label>{t("orders.customer")}</Label>
            <Select value={customerId} onValueChange={selectCustomer}>
              <SelectTrigger>
                <SelectValue placeholder={t("orders.form.selectCustomerPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customerId && (
              <p className="text-xs text-muted-foreground">
                {t("orders.form.customerDeliveryHint")}
              </p>
            )}
          </div>

          {/* Products */}
          <div className="space-y-3">
            <Label>{t("orders.items")}</Label>
            {activeProducts.length > 0 && (
              <Select onValueChange={addProduct}>
                <SelectTrigger>
                  <SelectValue placeholder={t("orders.form.addProductPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {activeProducts
                    .filter((p) => !items.some((i) => i.productId === p.id))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {formatDZD(p.price)} (stock: {p.stock})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}

            {items.length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                {items.map((item, i) => (
                  <div key={item.productId} className="flex items-center gap-3">
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDZD(item.unitPrice)} × {item.quantity} = {formatDZD(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(i, parseInt(e.target.value) || 1)}
                      className="w-16 text-center"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(i)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed">
                {t("orders.form.noItems")}
              </p>
            )}
          </div>

          <Separator />

          {/* Delivery info */}
          <div className="space-y-4">
            <Label className="text-base">{t("orders.form.delivery")}</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders.wilaya")}</Label>
                <Select value={wilaya} onValueChange={(v) => { setWilaya(v); setCommune(""); setCommunes([]); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("orders.form.wilayaPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {wilayas.map((w) => (
                      <SelectItem key={w.code} value={w.name}>
                        {w.code} — {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders.commune")}</Label>
                <Select value={commune} onValueChange={setCommune} disabled={!wilaya}>
                  <SelectTrigger>
                    <SelectValue placeholder={wilaya ? t("orders.form.selectCommunePlaceholder") : t("orders.form.chooseWilayaFirst")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {communesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : communes.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        {t("orders.form.noCommunes")}
                      </div>
                    ) : (
                      communes.map((c) => (
                        <SelectItem key={c.code} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("orders.form.address")}</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("orders.form.addressPlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders.phone")}</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0X XX XX XX XX"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders.form.deliveryCostLabel")}</Label>
                <Input
                  type="number"
                  value={deliveryCost}
                  onChange={(e) => setDeliveryCost(e.target.value)}
                  placeholder="600"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Total */}
          <div className="flex items-center justify-between rounded-lg bg-muted p-4">
            <span className="text-sm font-medium">{t("orders.total")}</span>
            <span className="text-xl font-bold">{formatDZD(total)}</span>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {t("orders.form.creating")}
              </>
            ) : (
              t("orders.createOrder")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
