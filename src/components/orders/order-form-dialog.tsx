"use client";

/**
 * OrderFormDialog — Phase 3 refactor.
 *
 * Migrated from raw useState to react-hook-form + zod resolver.
 * Key upgrades:
 *   - Inline validation (per-field, on blur + on change after first submit)
 *   - Phone input mask (Algerian 0X XX XX XX XX format)
 *   - Dirty-guard (warns on tab close / refresh with unsaved changes)
 *   - localStorage draft (restores form on crash/refresh)
 *   - FormField/FormInput primitives with accessible error display
 *
 * The submit logic (create customer → create order → navigate) is preserved.
 */
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart, Loader2 } from "lucide-react";
import { formatDZD } from "@/lib/utils";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";
import { ProductVariantPicker, type VariantOption } from "@/components/products/product-variant-picker";
import { useI18n } from "@/hooks/use-i18n";
import { usePhoneMask } from "@/hooks/form/use-phone-mask";
import { useDirtyGuard } from "@/hooks/form/use-dirty-guard";
import { useFormDraft, clearFormDraft } from "@/hooks/form/use-form-draft";
import { toast } from "@/lib/toast";
import { mutatePrefix } from "@/lib/swr/mutate";
import { orderFormSchema, type OrderFormValues } from "@/lib/validation/order-schema";

interface Customer {
  id: string; name: string; phone: string;
  wilaya: string | null; commune: string | null; address: string | null;
}
interface Product {
  id: string; name: string; price: number; stock: number; isActive: boolean;
  productVariants?: VariantOption[];
}

interface OrderFormDialogProps {
  customers: Customer[];
  products: Product[];
}

const DRAFT_KEY = "sf-order-create-draft";

export function OrderFormDialog({ customers, products }: OrderFormDialogProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { format: formatPhone } = usePhoneMask();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customerId: "",
      isNewCustomer: false,
      newCustomerName: "",
      wilaya: "",
      commune: "",
      address: "",
      phone: "",
      items: [],
      deliveryCost: 600,
    },
    mode: "onBlur",
  });

  const { fields, append, remove, update } = useFieldArray({ control: form.control, name: "items" });

  // Dirty guard + draft persistence (only when dialog is open)
  useDirtyGuard(form);
  useFormDraft(form, DRAFT_KEY, open);

  const watchValues = form.watch();
  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  const total = useMemo(() => {
    const itemsTotal = (watchValues.items ?? []).reduce((sum, i) => sum + (i.unitPrice ?? 0) * (i.quantity ?? 0), 0);
    const delivery = watchValues.deliveryCost ?? 0;
    return itemsTotal + delivery;
  }, [watchValues.items, watchValues.deliveryCost]);

  function addProduct(productId: string) {
    const product = activeProducts.find((p) => p.id === productId);
    if (!product) return;
    if (fields.some((f) => f.productId === productId)) return;
    append({
      productId: product.id,
      productName: product.name,
      productVariantId: null,
      productVariantName: null,
      quantity: 1,
      unitPrice: product.price,
    });
  }

  function removeItem(index: number) {
    remove(index);
  }

  function updateQuantity(index: number, quantity: number) {
    if (quantity < 1) return;
    update(index, { ...fields[index]!, quantity });
  }

  function updateVariant(index: number, variantId: string | null) {
    const item = fields[index]!;
    const product = activeProducts.find((p) => p.id === item.productId);
    const variant = product?.productVariants?.find((v) => v.id === variantId) ?? null;
    const variantPrice = variant?.price ?? product?.price ?? item.unitPrice;
    update(index, {
      ...item,
      productVariantId: variantId,
      productVariantName: variant?.name ?? null,
      unitPrice: variantPrice,
    });
  }

  function selectCustomer(id: string) {
    form.setValue("customerId", id, { shouldDirty: true });
    form.setValue("isNewCustomer", false);
    const customer = customers.find((c) => c.id === id);
    if (customer) {
      form.setValue("wilaya", customer.wilaya ?? "", { shouldDirty: true });
      form.setValue("commune", customer.commune ?? "", { shouldDirty: true });
      form.setValue("address", customer.address ?? "", { shouldDirty: true });
      form.setValue("phone", formatPhone(customer.phone), { shouldDirty: true });
    }
  }

  function toggleNewCustomerMode() {
    const current = form.getValues("isNewCustomer");
    form.setValue("isNewCustomer", !current, { shouldDirty: true });
    form.setValue("customerId", "", { shouldDirty: true });
    form.setValue("newCustomerName", "", { shouldDirty: true });
    if (!current) {
      form.setValue("wilaya", "", { shouldDirty: true });
      form.setValue("commune", "", { shouldDirty: true });
      form.setValue("address", "", { shouldDirty: true });
      form.setValue("phone", "", { shouldDirty: true });
    }
  }

  async function onSubmit(data: OrderFormValues) {
    setLoading(true);
    try {
      let finalCustomerId = data.customerId;
      if (data.isNewCustomer) {
        const custRes = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.newCustomerName,
            phone: data.phone,
            wilaya: data.wilaya,
            commune: data.commune,
            address: data.address,
          }),
        });
        if (!custRes.ok) {
          const err = await custRes.json().catch(() => ({}));
          toast.error(err.error?.message ?? err.error ?? t("orders.form.errorCreatingCustomer"));
          setLoading(false);
          return;
        }
        const custData = await custRes.json();
        finalCustomerId = custData.customer.id;
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: finalCustomerId,
          items: data.items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            productVariantId: i.productVariantId,
            productVariantName: i.productVariantName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          wilaya: data.wilaya,
          commune: data.commune,
          address: data.address,
          phone: data.phone,
          source: "manual",
          deliveryCost: data.deliveryCost ?? 600,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message ?? errData.error ?? t("orders.form.createFailed"));
      }

      const { order } = await res.json();
      setOpen(false);
      form.reset();
      clearFormDraft(DRAFT_KEY);
      await mutatePrefix("/api/orders");
      toast.success(t("orders.orderCreated"));
      router.push(`/orders/${order.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("orders.form.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = form.handleSubmit(onSubmit as never);
  const isNewCustomerMode = watchValues.isNewCustomer;
  const error = form.formState.errors.root?.message;

  // Format phone on change
  const onPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    form.setValue("phone", formatted, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <FormProvider {...form}>
      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          // Keep draft — user might re-open. Only clear on successful submit.
        }
      }}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="h-4 w-4 me-1.5" />
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

          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            {/* Customer selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("orders.customer")}</Label>
                <Button type="button" variant="ghost" size="sm" onClick={toggleNewCustomerMode} className="text-xs h-7">
                  {isNewCustomerMode ? t("orders.form.chooseExistingCustomer") : t("orders.form.createNewCustomer")}
                </Button>
              </div>
              {isNewCustomerMode ? (
                <Input
                  {...form.register("newCustomerName")}
                  placeholder={t("orders.form.newCustomerNamePlaceholder")}
                />
              ) : (
                <Select value={watchValues.customerId} onValueChange={selectCustomer}>
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
              )}
              {form.formState.errors.customerId && (
                <p className="text-xs text-destructive">{form.formState.errors.customerId.message}</p>
              )}
              {(watchValues.customerId || isNewCustomerMode) && (
                <p className="text-xs text-muted-foreground">{t("orders.form.customerDeliveryHint")}</p>
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
                      .filter((p) => !fields.some((f) => f.productId === p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatDZD(p.price)} (stock: {p.stock})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {fields.length > 0 ? (
                <div className="space-y-2 rounded-lg border p-3">
                  {fields.map((item, i) => {
                    const product = activeProducts.find((p) => p.id === item.productId);
                    const variants = product?.productVariants ?? [];
                    return (
                      <div key={item.id} className="space-y-2">
                        <div className="flex items-center gap-3">
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
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)} className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {variants.length > 1 && (
                          <ProductVariantPicker
                            variants={variants}
                            defaultPrice={product?.price ?? item.unitPrice}
                            value={item.productVariantId}
                            onChange={(vId) => updateVariant(i, vId)}
                            showLabel={true}
                            size="sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed">
                  {t("orders.form.noItems")}
                </p>
              )}
              {form.formState.errors.items && (
                <p className="text-xs text-destructive">{form.formState.errors.items.message}</p>
              )}
            </div>

            <Separator />

            {/* Delivery info */}
            <div className="space-y-4">
              <Label className="text-base">{t("orders.form.delivery")}</Label>
              <WilayaCommuneSelect
                wilaya={watchValues.wilaya}
                commune={watchValues.commune}
                onWilayaChange={(v) => form.setValue("wilaya", v, { shouldDirty: true, shouldValidate: true })}
                onCommuneChange={(v) => form.setValue("commune", v, { shouldDirty: true, shouldValidate: true })}
                required
              />
              {form.formState.errors.wilaya && (
                <p className="text-xs text-destructive">{form.formState.errors.wilaya.message}</p>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders.form.address")}</Label>
                <Input
                  value={watchValues.address}
                  onChange={(e) => form.setValue("address", e.target.value, { shouldDirty: true, shouldValidate: true })}
                  placeholder={t("orders.form.addressPlaceholder")}
                />
                {form.formState.errors.address && (
                  <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("orders.phone")}</Label>
                  <Input
                    value={watchValues.phone}
                    onChange={onPhoneChange}
                    placeholder="0X XX XX XX XX"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("orders.form.deliveryCostLabel")}</Label>
                  <Input
                    type="number"
                    value={watchValues.deliveryCost}
                    onChange={(e) => form.setValue("deliveryCost", parseInt(e.target.value) || 0, { shouldDirty: true })}
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
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                  {t("orders.form.creating")}
                </>
              ) : (
                t("orders.createOrder")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
