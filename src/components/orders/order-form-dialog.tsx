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
import { useCallback, useState, useMemo, useRef } from "react";
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
import { Plus, Trash2, ShoppingCart, Loader2, AlertTriangle } from "lucide-react";
import { formatDZD } from "@/lib/utils";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";
import { ProductVariantPicker } from "@/components/products/product-variant-picker";
import {
  OrderCustomerCombobox,
  type OrderFormCustomer,
} from "@/components/orders/order-customer-combobox";
import {
  OrderProductCombobox,
  type OrderFormProduct,
} from "@/components/orders/order-product-combobox";
import { useI18n } from "@/hooks/use-i18n";
import { DZ_PHONE_PLACEHOLDER, formatDZPhone } from "@/lib/validation/phone";
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

/**
 * Customer/product rows come in as a capped most-recent slice (R2-c); the
 * comboboxes query /api/customers/search and /api/products on demand for
 * the rest of the catalog instead of rendering it all in the DOM.
 */
interface OrderFormDialogProps {
  customers: OrderFormCustomer[];
  products: OrderFormProduct[];
}

const DRAFT_KEY = "sf-order-create-draft";
const COMMAND_KEY = "sf-order-create-command";

export function OrderFormDialog({ customers, products }: OrderFormDialogProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
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

  // R2-c: `products` is a capped initial slice. Every remote combobox result
  // page is merged into this cache so variant-aware row logic (addProduct /
  // updateVariant / the picker) keeps working for products outside the slice.
  const [remoteProducts, setRemoteProducts] = useState<OrderFormProduct[]>([]);
  const registerRemoteProducts = useCallback((fetched: OrderFormProduct[]) => {
    setRemoteProducts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const additions = fetched.filter((p) => !seen.has(p.id));
      return additions.length ? [...prev, ...additions] : prev;
    });
  }, []);
  const productCatalog = useMemo(() => {
    const localIds = new Set(products.map((p) => p.id));
    return [
      ...products,
      ...remoteProducts.filter((p) => !localIds.has(p.id)),
    ];
  }, [products, remoteProducts]);
  const activeProducts = useMemo(
    () => productCatalog.filter((p) => p.isActive),
    [productCatalog],
  );

  const total = useMemo(() => {
    const itemsTotal = (watchValues.items ?? []).reduce((sum, i) => sum + (i.unitPrice ?? 0) * (i.quantity ?? 0), 0);
    const delivery = watchValues.deliveryCost ?? 0;
    return itemsTotal + delivery;
  }, [watchValues.items, watchValues.deliveryCost]);

  function addProduct(product: OrderFormProduct) {
    const variants = (product.productVariants ?? []).filter(
      (variant) => variant.isActive,
    );
    const selectedVariantIds = new Set(
      fields
        .filter((field) => field.productId === product.id)
        .map((field) => field.productVariantId)
        .filter((variantId): variantId is string => Boolean(variantId)),
    );
    if (
      variants.length === 0 &&
      fields.some((field) => field.productId === product.id)
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
      unitPrice: nextVariant?.price ?? product.price ?? 0,
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
    const variantPrice = variant?.price ?? product?.price ?? item.unitPrice ?? 0;
    update(index, {
      ...item,
      productVariantId: variantId,
      productVariantName: variant?.name ?? null,
      unitPrice: variantPrice,
    });
  }

  function selectCustomer(customer: OrderFormCustomer) {
    form.setValue("customerId", customer.id, { shouldDirty: true });
    form.setValue("isNewCustomer", false);
    form.setValue("wilaya", customer.wilaya ?? "", { shouldDirty: true });
    form.setValue("commune", customer.commune ?? "", { shouldDirty: true });
    form.setValue("address", customer.address ?? "", { shouldDirty: true });
    form.setValue("phone", formatDZPhone(customer.phone), { shouldDirty: true });
  }

  /**
   * "Create new customer" affordance from the combobox footer: switches to the
   * new-customer flow (existing dialog path) and pre-fills the typed query as
   * the customer name so the seller never retypes it.
   */
  function startNewCustomerFromQuery(name: string) {
    if (!watchValues.isNewCustomer) toggleNewCustomerMode();
    form.setValue("newCustomerName", name, {
      shouldDirty: true,
      shouldValidate: true,
    });
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

  // Format phone on change (canonical "0X XX XX XX XX" mask)
  const onPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDZPhone(e.target.value);
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
                <Label
                  htmlFor={
                    isNewCustomerMode
                      ? "order-form-new-customer-name"
                      : "order-form-customer-select"
                  }
                >
                  {t("orders.customer")}
                </Label>
                <Button type="button" variant="ghost" size="sm" onClick={toggleNewCustomerMode} className="text-xs h-7">
                  {isNewCustomerMode ? t("orders.form.chooseExistingCustomer") : t("orders.form.createNewCustomer")}
                </Button>
              </div>
              {isNewCustomerMode ? (
                <Input
                  id="order-form-new-customer-name"
                  {...form.register("newCustomerName")}
                  placeholder={t("orders.form.newCustomerNamePlaceholder")}
                  aria-invalid={Boolean(form.formState.errors.newCustomerName)}
                  aria-describedby={
                    form.formState.errors.newCustomerName
                      ? "order-form-customer-error"
                      : watchValues.customerId || isNewCustomerMode
                        ? "order-form-customer-hint"
                        : undefined
                  }
                />
              ) : (
                <OrderCustomerCombobox
                  id="order-form-customer-select"
                  customers={customers}
                  value={watchValues.customerId ?? ""}
                  onSelect={selectCustomer}
                  onCreateNew={startNewCustomerFromQuery}
                  ariaInvalid={Boolean(form.formState.errors.customerId)}
                  ariaDescribedBy={
                    form.formState.errors.customerId
                      ? "order-form-customer-error"
                      : watchValues.customerId || isNewCustomerMode
                        ? "order-form-customer-hint"
                        : undefined
                  }
                />
              )}
              {(form.formState.errors.customerId ||
                form.formState.errors.newCustomerName) && (
                <p id="order-form-customer-error" className="text-xs text-destructive">
                  {form.formState.errors.customerId?.message ??
                    form.formState.errors.newCustomerName?.message}
                </p>
              )}
              {(watchValues.customerId || isNewCustomerMode) && (
                <p id="order-form-customer-hint" className="text-xs text-muted-foreground">
                  {t("orders.form.customerDeliveryHint")}
                </p>
              )}
            </div>

            {/* Products */}
            <div className="space-y-3">
              <Label htmlFor="order-form-add-product">{t("orders.items")}</Label>
              {activeProducts.length > 0 && (
                <OrderProductCombobox
                  id="order-form-add-product"
                  products={activeProducts}
                  selectedFields={fields.map((field) => ({
                    productId: field.productId,
                    productVariantId: field.productVariantId ?? null,
                  }))}
                  onSelect={addProduct}
                  onProductsLoaded={registerRemoteProducts}
                  ariaDescribedBy={
                    form.formState.errors.items ? "order-form-items-error" : undefined
                  }
                />
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
                              {formatDZD(item.unitPrice, locale)} × {item.quantity} = {formatDZD(item.unitPrice * item.quantity, locale)}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min="1"
                            aria-label={`${item.productName} — ${t("orders.quantity")}`}
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
                <p id="order-form-items-error" className="text-xs text-destructive">
                  {form.formState.errors.items.message}
                </p>
              )}
            </div>

            <Separator />

            {/* Delivery info */}
            <div className="space-y-4">
              <p className="text-base font-medium">{t("orders.form.delivery")}</p>
              <WilayaCommuneSelect
                wilaya={watchValues.wilaya}
                commune={watchValues.commune}
                onWilayaChange={(v) => form.setValue("wilaya", v, { shouldDirty: true, shouldValidate: true })}
                onCommuneChange={(v) => form.setValue("commune", v, { shouldDirty: true, shouldValidate: true })}
                wilayaAriaDescribedby={form.formState.errors.wilaya ? "order-form-wilaya-error" : undefined}
                communeAriaDescribedby={form.formState.errors.commune ? "order-form-commune-error" : undefined}
                required
              />
              {form.formState.errors.wilaya && (
                <p id="order-form-wilaya-error" className="text-xs text-destructive">
                  {form.formState.errors.wilaya.message}
                </p>
              )}
              {form.formState.errors.commune && (
                <p id="order-form-commune-error" className="text-xs text-destructive">
                  {form.formState.errors.commune.message}
                </p>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="order-form-address">
                  {t("orders.form.address")}
                </Label>
                <Input
                  id="order-form-address"
                  value={watchValues.address}
                  onChange={(e) => form.setValue("address", e.target.value, { shouldDirty: true, shouldValidate: true })}
                  placeholder={t("orders.form.addressPlaceholder")}
                  aria-invalid={Boolean(form.formState.errors.address)}
                  aria-describedby={form.formState.errors.address ? "order-form-address-error" : undefined}
                />
                {form.formState.errors.address && (
                  <p id="order-form-address-error" className="text-xs text-destructive">
                    {form.formState.errors.address.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="order-form-phone">
                    {t("orders.phone")}
                  </Label>
                  {/* Phone digits are technical LTR content — type/inputMode/dir
                      keep the "05 55 12 34 56" groups from reordering in RTL. */}
                  <Input
                    id="order-form-phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    autoComplete="tel-national"
                    value={watchValues.phone}
                    onChange={onPhoneChange}
                    placeholder={DZ_PHONE_PLACEHOLDER}
                    aria-invalid={Boolean(form.formState.errors.phone)}
                    aria-describedby={form.formState.errors.phone ? "order-form-phone-error" : undefined}
                  />
                  {form.formState.errors.phone && (
                    <p id="order-form-phone-error" className="text-xs text-destructive">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="order-form-delivery-cost">
                    {t("orders.form.deliveryCostLabel")}
                  </Label>
                  <Input
                    id="order-form-delivery-cost"
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
              <span className="text-xl font-bold">{formatDZD(total, locale)}</span>
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
