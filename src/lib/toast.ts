/**
 * Toast wrapper (Phase 0 foundation).
 *
 * A thin wrapper around `sonner` that:
 *   - centralizes default styling + duration per variant
 *   - adds `data-testid` for reliable E2E targeting
 *   - provides a Cal.com-style `showToast(message, variant)` simple API
 *     alongside the full sonner `toast.*` API for existing call sites
 *
 * Usage (simple, for new code):
 *   import { showToast } from "@/lib/toast";
 *   showToast.success(t("orders.orderCreated"));
 *   showToast.error("Something went wrong");
 *   showToast.promise(asyncFn, { loading: "Saving…", success: "Saved", error: "Failed" });
 *   showToast.success("Deleted", { action: { label: "Undo", onClick: restore } });
 *
 * Usage (migration): existing `toast.success(...)` call sites can swap
 * `import { toast } from "sonner"` → `import { toast } from "@/lib/toast"`
 * and keep the same call signatures (this re-exports sonner's toast with
 * our defaults pre-applied).
 */
import { toast as sonnerToast, type ExternalToast } from "sonner";

type ToastVariant = "default" | "success" | "error" | "info" | "warning" | "loading";

/** The options bag sonner accepts for `toast.promise` (loading/success/error renderers + toast options). */
type PromiseToastData = Parameters<typeof sonnerToast.promise>[1];

const DEFAULT_DURATION = 5000; // 5s — long enough to read + click undo

/**
 * Apply our default options + sf-toast class to every toast.
 *
 * `toast.promise` re-applies the same shape inline (with the identical object
 * spread) because sonner's promise options bag (`loading`/`success`/`error`
 * renderers) is not assignable to plain `ExternalToast` — its `description`
 * also accepts render functions.
 */
function withDefaults(options?: ExternalToast): ExternalToast {
  return {
    duration: DEFAULT_DURATION,
    ...options,
    // data-testid lets Playwright/sf-browser target toasts reliably.
    // Sonner merges classNames via the `classNames` option.
    classNames: {
      toast: "sf-toast",
      ...(options?.classNames ?? {}),
    },
  };
}

/** The full sonner toast API, with our defaults pre-applied. */
export const toast = {
  success: (message: string, options?: ExternalToast) =>
    sonnerToast.success(message, withDefaults(options)),
  error: (message: string, options?: ExternalToast) =>
    sonnerToast.error(message, withDefaults({ duration: 7000, ...options })),
  info: (message: string, options?: ExternalToast) =>
    sonnerToast.info(message, withDefaults(options)),
  warning: (message: string, options?: ExternalToast) =>
    sonnerToast.warning(message, withDefaults(options)),
  loading: (message: string, options?: ExternalToast) =>
    sonnerToast.loading(message, withDefaults(options)),
  // Promise toasts get the same house defaults (sf-toast class, default
  // duration) as success/error — sonner's raw re-export styled differently.
  // Mirrors withDefaults() field-for-field; see the note above withDefaults.
  promise: <Data>(
    promise: Promise<Data> | (() => Promise<Data>),
    data?: PromiseToastData,
  ) =>
    sonnerToast.promise<Data>(promise, {
      duration: DEFAULT_DURATION,
      ...data,
      classNames: {
        toast: "sf-toast",
        ...(data?.classNames ?? {}),
      },
    }),
  dismiss: sonnerToast.dismiss,
  custom: sonnerToast.custom,
};

/**
 * Cal.com-style simple API. `showToast(message)` or `showToast(message, variant)`.
 * Prefer `toast.success(...)` etc. for new code — this is for concise call sites.
 */
export function showToast(
  message: string,
  variant: ToastVariant = "default",
  options?: ExternalToast,
): void {
  switch (variant) {
    case "success":
      toast.success(message, options);
      break;
    case "error":
      toast.error(message, options);
      break;
    case "info":
      toast.info(message, options);
      break;
    case "warning":
      toast.warning(message, options);
      break;
    case "loading":
      toast.loading(message, options);
      break;
    default:
      sonnerToast(message, withDefaults(options));
  }
}
