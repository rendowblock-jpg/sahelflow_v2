"use client";

/**
 * useUndoableDelete — soft-delete with undo toast (Phase 2).
 *
 * The pattern that disproves the false "undo on delete: yes" handoff claim.
 * Instead of permanent delete + "This action cannot be undone", every delete:
 *   1. Calls the soft-delete API (sets deletedAt, returns the record)
 *   2. Shows toast.success("X deleted", { action: { label: "Undo", onClick: restore } })
 *   3. 6-second undo window — if user clicks Undo, calls the restore API
 *   4. After the window, the record stays soft-deleted (a future cleanup job
 *      can hard-delete records older than 30 days)
 *
 * Usage:
 *   const deleteOrder = useUndoableDelete({
 *     deleteUrl: (id) => `/api/orders/${id}`,
 *     restoreUrl: (id) => `/api/orders/${id}/restore`,
 *     entityLabel: "Order",
 *     onAfter: () => mutatePrefix("/api/orders"),
 *   });
 *   <button onClick={() => deleteOrder(id)}>Delete</button>
 */
import { useCallback } from "react";
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/use-i18n";

interface UseUndoableDeleteOptions {
  /** Build the soft-delete URL from the id. */
  deleteUrl: (id: string) => string;
  /** Build the restore URL from the id. If omitted, undo is disabled. */
  restoreUrl?: (id: string) => string;
  /** The label shown in the toast ("Order ORD-0012 deleted"). */
  entityLabel: string;
  /** Optional: build a contextual label from the deleted record (e.g. "Order ORD-0012"). */
  contextualLabel?: (record: unknown) => string;
  /** Called after delete OR restore (e.g. mutatePrefix to revalidate lists). */
  onAfter?: () => void | Promise<void>;
  /** Undo window in ms (default 6000). */
  undoWindowMs?: number;
}

export function useUndoableDelete(opts: UseUndoableDeleteOptions) {
  const { t } = useI18n();
  const undoWindow = opts.undoWindowMs ?? 6000;

  return useCallback(
    async (id: string) => {
      try {
        const res = await fetch(opts.deleteUrl(id), {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message ?? body.error ?? `Delete failed (${res.status})`);
        }
        const body = await res.json().catch(() => ({}));
        const label = opts.contextualLabel
          ? opts.contextualLabel(body.record ?? body)
          : opts.entityLabel;

        // Show toast with undo action
        const undoAction = opts.restoreUrl
          ? {
              label: t("common.undo"),
              onClick: async () => {
                try {
                  const restoreRes = await fetch(opts.restoreUrl!(id), {
                    method: "POST",
                    credentials: "same-origin",
                  });
                  if (!restoreRes.ok) throw new Error("Restore failed");
                  toast.success(t("common.restored", { entity: label }));
                  await opts.onAfter?.();
                } catch {
                  toast.error(t("common.restoreFailed"));
                }
              },
            }
          : undefined;

        toast.success(t("common.deleted", { entity: label }), {
          duration: undoWindow,
          action: undoAction,
        });

        await opts.onAfter?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed";
        toast.error(msg);
      }
    },
    [opts, t],
  );
}
