"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { mutatePrefix } from "@/lib/swr/mutate";
import { useForm } from "react-hook-form";
import { useDirtyGuard } from "@/hooks/form/use-dirty-guard";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  createExpenseSchema,
  expenseCategorySchema,
  posInt,
  type ExpenseCategory,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** All 8 expense categories (drives the Select dropdown options). */
const EXPENSE_CATEGORIES = expenseCategorySchema.options;

/**
 * Client-side form schema — mirrors createExpenseSchema but allows the amount
 * field to be empty while the user is typing (mirrors the product form's price
 * field). A manual pre-submit check in `onSubmit` surfaces a clear error for
 * an empty amount before the API's strict `posInt` schema rejects it.
 *
 * `date` is a YYYY-MM-DD string from `<input type="date">`; it is converted to
 * an ISO datetime string at submit time (see `onSubmit`).
 */
const formSchema = createExpenseSchema.extend({
  // Allow "" while the user is typing (mirrors the product form's price field).
  // A manual pre-submit check in `onSubmit` surfaces a clearer error before
  // the API's strict `posInt` schema rejects an empty value.
  amount: z.union([posInt, z.literal("")]),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Shape accepted by ExpenseFormDialog in edit mode. `date` is an ISO datetime
 * string (what Prisma returns when serialized); the dialog extracts the
 * YYYY-MM-DD portion for the date input.
 */
export interface ExpenseFormDialogExpense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // ISO datetime string
  notes?: string | null;
}

interface ExpenseFormDialogProps {
  /** If provided, the dialog operates in EDIT mode (PATCH). */
  expense?: ExpenseFormDialogExpense;
  /** Custom trigger element (e.g. an edit icon button). Defaults to "Add Expense" in uncontrolled mode. */
  trigger?: ReactNode;
  /** Controlled open state. When provided, the dialog is controlled by the parent (no default trigger is rendered unless `trigger` is also given). */
  open?: boolean;
  /** Called when the dialog requests to open/close (controlled mode). */
  onOpenChange?: (open: boolean) => void;
}

/** Format an ISO datetime string as YYYY-MM-DD for `<input type="date">`. */
function isoToDateInput(iso: string): string {
  // Slice is safe even if `iso` is already YYYY-MM-DD (length 10).
  return iso.slice(0, 10);
}

/** Default date for create mode = today (UTC, matches the server's UTC storage). */
function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormDialog({
  expense,
  trigger,
  open: openProp,
  onOpenChange,
}: ExpenseFormDialogProps) {
  const { t } = useI18n();
  const isEdit = !!expense;
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const buildDefaults = (e?: ExpenseFormDialogExpense): FormValues => ({
    category: e?.category ?? "ads",
    amount: e?.amount ?? "",
    date: e ? isoToDateInput(e.date) : todayDateInput(),
    notes: e?.notes ?? "",
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(expense),
  });
  useDirtyGuard(form);

  // Keep the form in sync if the `expense` prop changes after a server
  // refresh (e.g. another agent edited the row, or we just saved).
  useEffect(() => {
    form.reset(buildDefaults(expense));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense]);

  async function onSubmit(values: FormValues) {
    setServerError(null);

    // The form schema allows "" while typing — block submit here with a clear
    // inline error rather than round-tripping to the API's strict `posInt`.
    if (values.amount === "") {
      setServerError(`${t("accounting.expenseAmount")}: required`);
      return;
    }

    setSubmitting(true);

    // Convert the date input (YYYY-MM-DD) to a UTC ISO datetime string so
    // the API's `isoDate` schema accepts it. Time is pinned to 00:00:00 UTC
    // so the same expense shows the same calendar day in every locale.
    const isoDate = new Date(`${values.date}T00:00:00.000Z`).toISOString();

    const payload = {
      category: values.category,
      amount: values.amount,
      date: isoDate,
      notes: values.notes?.trim() ? values.notes.trim() : null,
    };

    try {
      const url = expense ? `/api/expenses/${expense.id}` : "/api/expenses";
      const method = expense ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; details?: unknown }
          | null;
        if (data?.details) {
          // Zod validation error from the server — surface the first issue
          const issues = data.details as { message: string; path: string[] }[];
          const first = issues[0];
          setServerError(
            first ? `${first.path.join(".")}: ${first.message}` : t("common.validationFailed"),
          );
        } else {
          setServerError(data?.error ?? `Request failed (${res.status})`);
        }
        return;
      }

      // Success: close + reset + refresh server-component data + toast
      form.reset();
      setOpen(false);
      toast.success(
        t(expense ? "accounting.expenseUpdated" : "accounting.expenseCreated"),
      );
      mutatePrefix("/api/expenses");
    } catch (err) {
      console.error("[ExpenseFormDialog] submit error:", err);
      setServerError(t("error.networkFailure"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && submitting) return; // don't allow closing mid-submit
    setOpen(next);
    if (!next) {
      form.reset(buildDefaults(expense));
      setServerError(null);
    }
  }

  const formId = isEdit ? "expense-edit-form" : "expense-create-form";

  const triggerNode = trigger ?? (isControlled ? null : (
    <Button>
      <Plus className="h-4 w-4" />
      {t("accounting.addExpense")}
    </Button>
  ));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {triggerNode && (
        <DialogTrigger asChild>{triggerNode}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("accounting.editExpense") : t("accounting.addExpense")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("accounting.editExpense") : t("accounting.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id={formId}
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("accounting.expenseCategory")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {t(`accounting.category.${cat}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("accounting.expenseAmount")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        placeholder="1500"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("accounting.expenseDate")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("accounting.expenseNotes")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("accounting.expenseNotesPlaceholder")}
                      className="min-h-20"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? t("common.saveChanges") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
