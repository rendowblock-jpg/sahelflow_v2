"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Loader2,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  ProductVariantPicker,
  type VariantOption,
} from "@/components/products/product-variant-picker";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";
import { useDirtyGuard } from "@/hooks/form/use-dirty-guard";
import { clearFormDraft, useFormDraft } from "@/hooks/form/use-form-draft";
import { usePhoneMask } from "@/hooks/form/use-phone-mask";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import {
  clearManualOrderCommand,
  resolveManualOrderCommand,
} from "@/lib/orders/manual-order-command-key";
import type { RiskAssessment } from "@/lib/risk-engine/types";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import { formatDZD } from "@/lib/utils";
import {
  orderFormSchema,
  type OrderFormValues,
} from "@/lib/validation/order-schema";

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
  const [riskWarning, setRiskWarning] = useState<{
    assessment: RiskAssessment;
    data: OrderFormValues;
  } | null>(null);
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

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useDirtyGuard(form);
  useFormDraft(form, DRAFT_KEY, open);

  const watchValues = form.watch();
  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );
  const total = useMemo(() => {
    const itemTotal = (watchValues.items ?? []).reduce(
      (sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 0),
      0,
    );
    return itemTotal + (watchValues.deliveryCost ?? 0);
  }, [watchValues.items, watchValues.deliveryCost]);

  function addProduct(productId: string) {
    const product = activeProducts.find(
      (candidate) => candidate.id === productId,
    );
    if (!product || fields.some((field) => field.productId === productId)) {
      return;
    }

    const variants = (product.productVariants ?? []).filter(
      (variant) => variant.isActive,
    );
    const soleVariant = variants.length === 1 ? variants[0] : null;
    append({
      productId: product.id,
      productName: product.name,
      productVariantId: soleVariant?.id ?? null,
      productVariantName: soleVariant?.name ?? null,
      requiresVariant: variants.length > 1,
      quantity: 1,
      unitPrice: soleVariant?.price ?? product.price,
    });
  }

  function updateQuantity(index: number, quantity: number) {
    if (quantity < 1) return;
    update(index, { ...fields[index]!, quantity });
  }

  function updateVariant(index: number, variantId: string | null) {
    const item = fields[index]!;
    const product = activeProducts.find(
      (candidate) => candidate.id === item.productId,
    );
    const variant =
      product?.productVariants?.find(
        (candidate) => candidate.id === variantId && candidate.isActive,
      ) ?? null;
    update(index, {
      ...item,
      productVariantId: variant?.id ?? null,
      productVariantName: variant?.name ?? null,
      unitPrice: variant?.price ?? product?.price ?? item.unitPrice,
    });
  }

  function selectCustomer(customerId: string) {
    form.setValue("customerId", customerId, { shouldDirty: true });
    form.setValue("isNewCustomer", false, { shouldDirty: true });
    const customer = customers.find((candidate) => candidate.id === customerId);
    if (!customer) return;
    form.setValue("wilaya", customer.wilaya ?? "", { shouldDirty: true });
    form.setValue("commune", customer.commune ?? "", { shouldDirty: true });
    form.setValue("address", customer.address ?? "", { shouldDirty: true });
    form.setValue("phone", formatPhone(customer.phone), { shouldDirty: true });
  }

  function toggleNewCustomerMode() {
    const next = !form.getValues("isNewCustomer");
    form.setValue("isNewCustomer", next, { shouldDirty: true });
    form.setValue("customerId", "", { shouldDirty: true });
    form.setValue("newCustomerName", "", { shouldDirty: true });
    if (next) {
      form.setValue("wilaya", "", { shouldDirty: true });
      form.setValue("commune", "", { shouldDirty: true });
      form.setValue("address", "", { shouldDirty: true });
      form.setValue("phone", "", { shouldDirty: true });
    }
  }

  async function checkPreCreateRisk(
    data: OrderFormValues,
  ): Promise<RiskAssessment | null> {
    try {
      const response = await fetch("/api/risk/assess-pre-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: data.phone,
          wilaya: data.wilaya,
          commune: data.commune,
          address: data.address,
          totalPrice: total,
          source: "manual",
          items: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        assessment: RiskAssessment;
      };
      return body.assessment;
    } catch {
      return null;
    }
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
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        idempotencyKey: command.idempotencyKey,
        correlationId: `manual-order-ui:${command.idempotencyKey}`,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        translateServerError(
          errorBody.error?.message ?? errorBody.error,
          t,
          t("orders.form.createFailed"),
        ),
      );
    }

    const body = await response.json();
    clearManualOrderCommand(window.localStorage, COMMAND_KEY);
    setOpen(false);
    form.reset();
    clearFormDraft(DRAFT_KEY);
    await mutatePrefix("/api/orders");
    toast.success(t("orders.orderCreated"));
    router.push(`/orders/${body.order.id}`);
  }

  async function onSubmit(data: OrderFormValues) {
    setLoading(true);
    try {
      if (!skipRiskCheckRef.current) {
        const assessment = await checkPreCreateRisk(data);
        if (assessment && assessment.score > 70) {
          setRiskWarning({ assessment, data });
          return;
        }
      }
      await createOrder(data);
      skipRiskCheckRef.current = false;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("orders.form.createFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function proceedWithCreate() {
    if (!riskWarning) return;
    const data = riskWarning.data;
    setRiskWarning(null);
    skipRiskCheckRef.current = true;
    await onSubmit(data);
  }

  function cancelRiskWarning() {
    setRiskWarning(null);
  }

  const handleSubmit = form.handleSubmit(onSubmit as never);
  const isNewCustomerMode = watchValues.isNewCustomer;
  const rootError = form.formState.errors.root?.message;

  return (
    <FormProvider {...form}>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && loading) return;
          setOpen(nextOpen);
        }}
      >
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("orders.customer")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleNewCustomerMode}
                  className="text-xs h-7"
                >
                  {isNewCustomerMode
                    ? t("orders.form.chooseExistingCustomer")
                    : t("orders.form.createNewCustomer")}
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
                    <SelectValue
                      placeholder={t("orders.form.selectCustomerPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} — {customer.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {form.formState.errors.customerId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.customerId.message}
                </p>
              )}
              {form.formState.errors.newCustomerName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.newCustomerName.message}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label>{t("orders.items")}</Label>
              {activeProducts.length > 0 && (
                <Select onValueChange={addProduct}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("orders.form.addProductPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProducts
                      .filter(
                        (product) =>
                          !fields.some((field) => field.productId === product.id),
                      )
                      .map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} — {formatDZD(product.price)} ({product.stock})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {fields.length > 0 ? (
                <div className="space-y-2 rounded-lg border p-3">
                  {fields.map((item, index) => {
                    const product = activeProducts.find(
                      (candidate) => candidate.id === item.productId,
                    );
                    const variants = (product?.productVariants ?? []).filter(
                      (variant) => variant.isActive,
                    );
                    const variantError =
                      form.formState.errors.items?.[index]?.productVariantId?.message;
                    return (
                      <div key={item.id} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 space-y-0.5">
                            <p className="text-sm font-medium">
                              {item.productName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDZD(item.unitPrice)} × {item.quantity} ={" "}
                              {formatDZD(item.unitPrice * item.quantity)}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) =>
                              updateQuantity(
                                index,
                                parseInt(event.target.value, 10) || 1,
                              )
                            }
                            className="w-16 text-center"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            className="text-destructive"
                            aria-label={t("orders.removeItem")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {variants.length > 0 && (
                          <>
                            <ProductVariantPicker
                              variants={variants}
                              defaultPrice={product?.price ?? item.unitPrice}
                              value={item.productVariantId}
                              onChange={(variantId) =>
                                updateVariant(index, variantId)
                              }
                              showLabel
                              required={variants.length > 1}
                              size="sm"
                            />
                            {variantError && (
                              <p className="text-xs text-destructive" role="alert">
                                {variantError}
                              </p>
                            )}
                          </>
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
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base">{t("orders.form.delivery")}</Label>
              <WilayaCommuneSelect
                wilaya={watchValues.wilaya}
                commune={watchValues.commune}
                onWilayaChange={(value) =>
                  form.setValue("wilaya", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                onCommuneChange={(value) =>
                  form.setValue("commune", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                required
              />
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders.form.address")}</Label>
                <Input
                  value={watchValues.address}
                  onChange={(event) =>
                    form.setValue("address", event.target.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  placeholder={t("orders.form.addressPlaceholder")}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("orders.phone")}</Label>
                  <Input
                    value={watchValues.phone}
                    onChange={(event) =>
                      form.setValue("phone", formatPhone(event.target.value), {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    placeholder="0X XX XX XX XX"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {t("orders.form.deliveryCostLabel")}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={watchValues.deliveryCost}
                    onChange={(event) =>
                      form.setValue(
                        "deliveryCost",
                        parseInt(event.target.value, 10) || 0,
                        { shouldDirty: true },
                      )
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between rounded-lg bg-muted p-4">
              <span className="text-sm font-medium">{t("orders.total")}</span>
              <span className="text-xl font-bold">{formatDZD(total)}</span>
            </div>

            {rootError && (
              <p className="text-sm text-destructive" role="alert">
                {rootError}
              </p>
            )}
          </form>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
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

      <AlertDialog
        open={riskWarning !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) cancelRiskWarning();
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle
                className="h-5 w-5 text-amber-500"
                aria-hidden="true"
              />
              {t("orders.form.riskWarningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
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
                      .filter(
                        (factor) =>
                          factor.direction === "risk" && factor.points > 0,
                      )
                      .sort((left, right) => right.points - left.points)
                      .slice(0, 5)
                      .map((factor) => (
                        <li
                          key={factor.id}
                          className="flex items-start gap-2"
                        >
                          <span className="font-mono text-amber-600 dark:text-amber-400">
                            +{factor.points}
                          </span>
                          <span>{factor.explanation}</span>
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
            <AlertDialogCancel
              onClick={cancelRiskWarning}
              disabled={loading}
            >
              {t("orders.form.riskWarningCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
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
