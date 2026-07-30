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
import { useState, useMemo, useRef } from "react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart, Loader2, AlertTriangle } from "lucide-react";
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
import type { RiskAssessment } from "@/lib/risk-engine/types";
import {
  clearManualOrderCommand,
  resolveManualOrderCommand,
} from "@/lib/orders/manual-order-command-key";

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
const COMMAND_KEY = "sf-order-create-command";

export function OrderFormDialog({ customers, products }: OrderFormDialogProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { format: formatPhone } = usePhoneMask();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // W3-4 (task 2-g): HIGH-risk confirmation state. When non-null, an
  // AlertDialog renders with the assessment breakdown + Proceed/Cancel.
  const [riskWarning, setRiskWarning] = useState<{
    assessment: RiskAssessment;
    data: OrderFormValues;
  } | null>(null);
  // W3-4: skip the risk check on re-submission after the seller confirms.
  // Reset to false after the order is successfully created.
  const skipRiskCheckRef = useRef(false);

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
    const variants = (product.productVariants ?? []).filter(
      (variant) => variant.isActive,
    );
    const selectedVariantIds = new Set(
      fields
        .filter((field) => field.productId === productId)
        .map((field) => field.productVariantId)
        .filter((variantId): variantId is string => Boolean(variantId)),
    );
    if (
      variants.length === 0 &&
      fields.some((field) => field.productId === productId)
    ) {
      return;
    }
    const nextVariant =
      variants.find((variant) => !selectedVariantIds.has(variant.id)) ?? null;
    if (variants.length > 0 && !nextVariant) return;
    append({
      productId: product.id,
      productName: product.name,
      productVariantId: nextVariant?.id ?? null,
      productVariantName: nextVariant?.name ?? null,
      requiresVariant: variants.length > 0,
      quantity: 1,
      unitPrice: nextVariant?.price ?? product.price,
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
      // ── W3-4 (task 2-g): pre-create risk check ──────────────────────────
      // Before creating the order, call /api/risk/assess-pre-create with the
      // form data. If the risk score is HIGH (>70), show a confirmation
      // dialog with the risk breakdown. The seller can proceed anyway (it's
      // a warning, not a block) or cancel to edit the form.
      //
      // skipRiskCheckRef is set to true when the seller clicks "Proceed
      // anyway" in the risk dialog — we then re-call onSubmit and skip the
      // check to avoid an infinite loop. The ref is reset after the order
      // is created (so the next order gets a fresh risk check).
      if (!skipRiskCheckRef.current) {
        const assessment = await checkPreCreateRisk(data);
        if (assessment && assessment.score > 70) {
          setRiskWarning({ assessment, data });
          setLoading(false);
          return;
        }
      }

      await createOrder(data);
      // Reset the skip flag after successful creation — next order gets a
      // fresh risk check.
      skipRiskCheckRef.current = false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("orders.form.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  /**
   * W3-4 (task 2-g): call the pre-create risk endpoint. Returns the
   * assessment, or null if the check failed (network error, 500, etc.).
   *
   * On failure, we proceed with order creation — risk is a WARNING, not a
   * gate. A risk-check API outage should NOT block all order creation.
   */
  async function checkPreCreateRisk(data: OrderFormValues): Promise<RiskAssessment | null> {
    try {
      const res = await fetch("/api/risk/assess-pre-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: data.phone,
          wilaya: data.wilaya,
          commune: data.commune,
          address: data.address,
          totalPrice: total,
          source: "manual",
          items: data.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });
      if (!res.ok) return null;
      const { assessment } = (await res.json()) as { assessment: RiskAssessment };
      return assessment;
    } catch {
      return null;
    }
  }

  /**
   * W3-4 (task 2-g): proceed with order creation after the seller confirms
   * the HIGH-risk warning. Sets skipRiskCheckRef so the re-submission
   * doesn't re-trigger the risk check.
   */
  async function proceedWithCreate() {
    if (!riskWarning) return;
    const { data } = riskWarning;
    setRiskWarning(null);
    skipRiskCheckRef.current = true;
    await onSubmit(data);
  }

  /** W3-4: cancel the risk warning — return to the form for editing. */
  function cancelRiskWarning() {
    setRiskWarning(null);
    // skipRiskCheckRef is NOT set — the next submit will re-check.
  }

  function buildTrustedRequest(data: OrderFormValues) {
    return {
      customerId: data.isNewCustomer ? undefined : data.customerId,
      newCustomer: data.isNewCustomer
        ? {
            name: data.newCustomerName,
            phone: data.phone,
            wilaya: data.wilaya,
            commune: data.commune,
            address: data.address,
          }
        : undefined,
      items: data.items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId ?? null,
        quantity: item.quantity,
      })),
      wilaya: data.wilaya,
      commune: data.commune,
      address: data.address,
      phone: data.phone,
      source: "manual" as const,
      deliveryCost: data.deliveryCost ?? 600,
    };
  }

  function commandFor(request: ReturnType<typeof buildTrustedRequest>) {
    return resolveManualOrderCommand(
      window.localStorage,
      COMMAND_KEY,
      JSON.stringify(request),
      () => crypto.randomUUID(),
    );
  }

  async function createOrder(data: OrderFormValues) {
    const request = buildTrustedRequest(data);
    const command = commandFor(request);
    const commandRequest = JSON.parse(
      command.requestJson,
    ) as ReturnType<typeof buildTrustedRequest>;
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...commandRequest,
        idempotencyKey: command.idempotencyKey,
        correlationId: `manual-order-ui:${command.idempotencyKey}`,
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message ?? errData.error ?? t("orders.form.createFailed"));
    }

    const { order } = await res.json();
    clearManualOrderCommand(window.localStorage, COMMAND_KEY);
    setOpen(false);
    form.reset();
    clearFormDraft(DRAFT_KEY);
    await mutatePrefix("/api/orders");
    toast.success(t("orders.orderCreated"));
    router.push(`/orders/${order.id}`);
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
        if (!v && loading) return; // don't allow closing mid-submit
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
                      .filter((product) => {
                        const variants = (product.productVariants ?? []).filter(
                          (variant) => variant.isActive,
                        );
                        if (variants.length === 0) {
                          return !fields.some(
                            (field) => field.productId === product.id,
                          );
                        }
                        const selectedVariantIds = new Set(
                          fields
                            .filter(
                              (field) => field.productId === product.id,
                            )
                            .map((field) => field.productVariantId)
                            .filter(
                              (variantId): variantId is string =>
                                Boolean(variantId),
                            ),
                        );
                        return variants.some(
                          (variant) => !selectedVariantIds.has(variant.id),
                        );
                      })
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
                    const variants = (product?.productVariants ?? []).filter(
                      (variant) => variant.isActive,
                    );
                    const variantsSelectedByOtherRows = new Set(
                      fields
                        .filter(
                          (field, index) =>
                            index !== i && field.productId === item.productId,
                        )
                        .map((field) => field.productVariantId)
                        .filter(
                          (variantId): variantId is string =>
                            Boolean(variantId),
                        ),
                    );
                    const selectableVariants = variants.filter(
                      (variant) =>
                        variant.id === item.productVariantId ||
                        !variantsSelectedByOtherRows.has(variant.id),
                    );
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
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)} className="text-destructive" aria-label={t("orders.removeItem")}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {variants.length > 0 && (
                          <ProductVariantPicker
                            variants={selectableVariants}
                            defaultPrice={product?.price ?? item.unitPrice}
                            value={item.productVariantId}
                            onChange={(vId) => updateVariant(i, vId)}
                            showLabel={true}
                            required
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

      {/* W3-4 (task 2-g): HIGH-risk pre-create confirmation dialog.
          Renders when `riskWarning` is set (i.e. the pre-create risk check
          returned score > 70). The seller can proceed anyway (warning, not
          a block) or cancel to edit the form. */}
      <AlertDialog
        open={riskWarning !== null}
        onOpenChange={(open) => {
          if (!open) cancelRiskWarning();
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              {t("orders.form.riskWarningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {/* asChild so we can render block-level content (the factor
                  list) inside the description — Radix's default is a <p>
                  which would nest <div>/<ul> illegally. */}
              <div className="space-y-3 text-sm">
                <p>
                  {t("orders.form.riskWarningBody", {
                    score: riskWarning?.assessment.score ?? 0,
                    level: riskWarning?.assessment.level ?? "high",
                  })}
                </p>
                {riskWarning && riskWarning.assessment.factors.length > 0 && (
                  <ul className="space-y-1 rounded-md bg-muted p-3 text-xs">
                    {riskWarning.assessment.factors
                      .filter((f) => f.direction === "risk" && f.points > 0)
                      .sort((a, b) => b.points - a.points)
                      .slice(0, 5)
                      .map((f) => (
                        <li key={f.id} className="flex items-start gap-2">
                          <span className="font-mono text-amber-600 dark:text-amber-400">
                            +{f.points}
                          </span>
                          <span>{f.explanation}</span>
                        </li>
                      ))}
                  </ul>
                )}
                <p className="text-muted-foreground">
                  {t("orders.form.riskWarningHint")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelRiskWarning} disabled={loading}>
              {t("orders.form.riskWarningCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // don't auto-close — let proceedWithCreate drive state
                void proceedWithCreate();
              }}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                  {t("orders.form.creating")}
                </>
              ) : (
                t("orders.form.riskWarningProceed")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
}
