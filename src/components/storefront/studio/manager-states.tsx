"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { SkeletonBar, SkeletonShell } from "@/components/shared/state-skeletons";
import { StateView } from "@/components/shared/state-view";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import {
  canStartManagerAction,
  managerFailureReason,
  managerSaveLine,
  type ManagerPhase,
  type ManagerVerb,
} from "@/components/storefront/studio/manager-feedback";
import { cn } from "@/lib/utils";

/** 36 px on a mouse, 44 px on touch. */
export const MANAGER_TOUCH = "min-h-9 [@media(pointer:coarse)]:min-h-11";

export type ManagerResult = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>;

/** Turns a fetch answer into a result; the reason is translated, never the raw server text. */
export async function settleResponse<D extends { error?: string }>(
  response: Response,
  t: Parameters<typeof managerFailureReason>[1],
  accept: (data: D) => boolean = () => true,
): Promise<Readonly<{ ok: true; data: D }> | Readonly<{ ok: false; reason: string }>> {
  const data = (await response.json().catch(() => ({}))) as D;
  if (response.ok && accept(data)) return { ok: true, data };
  return { ok: false, reason: managerFailureReason(data, t) };
}

/**
 * One action at a time. The lock is a ref, so a second tap in the same frame
 * cannot start a second request; `state` drives the words beside the button.
 */
export function useManagerAction(canManage: boolean) {
  const { t } = useI18n();
  const [state, setState] = useState<ManagerPhase>({ phase: "idle" });
  const busyRef = useRef(false);
  const run = useCallback(
    async (action: () => Promise<ManagerResult>): Promise<boolean> => {
      if (!canStartManagerAction({ canManage, busy: busyRef.current })) return false;
      busyRef.current = true;
      setState({ phase: "saving" });
      try {
        const result = await action();
        setState(result.ok ? { phase: "saved" } : { phase: "failed", reason: result.reason });
        return result.ok;
      } catch {
        setState({ phase: "failed", reason: managerFailureReason(null, t) });
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [canManage, t],
  );
  return { state, busy: state.phase === "saving", run };
}

/** Saving / saved / failed, beside the button. The region stays mounted so screen readers hear changes. */
export function ManagerSaveLine({ state, verb }: { state: ManagerPhase; verb: ManagerVerb }) {
  const { t } = useI18n();
  const line = managerSaveLine(state, t, verb);
  return (
    <p
      role={line?.role ?? "status"}
      data-testid="manager-save-line"
      className={cn("min-h-5 text-sm", line?.role === "alert" ? "text-destructive" : "text-muted-foreground")}
    >
      {line?.text ?? ""}
    </p>
  );
}

/** The shape of a management card while it loads: a heading, a line, then rows. */
export function ManagerSkeleton({ rows = 3, testId = "manager-loading" }: { rows?: number; testId?: string }) {
  return (
    <SkeletonShell testId={testId} className="space-y-4 rounded-surface border p-4">
      <SkeletonBar className="h-5 w-48" />
      <SkeletonBar className="h-4 w-full max-w-md" />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBar key={i} className="h-14 w-full" />
      ))}
    </SkeletonShell>
  );
}

/** Designed empty state: a title, one sentence and at most one action. */
export function ManagerEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <StateView kind="empty" size="panel" title={title} description={body} action={action} testId="manager-empty" />;
}

/** No store exists yet: the one action is to create one. */
export function ManagerNoStore() {
  const { t } = useI18n();
  return (
    <ManagerEmpty
      title={t("storefront.studioStates.manager.noStoreTitle")}
      body={t("storefront.studioStates.manager.noStoreBody")}
      action={
        <Link href="/storefronts/new" className={cn(buttonVariants({ size: "sm" }), MANAGER_TOUCH)}>
          {t("storefront.studioStates.manager.noStoreAction")}
        </Link>
      }
    />
  );
}

/** The section could not load: a calm sentence and Retry; nothing technical is shown. */
export function ManagerLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <StateView
      kind="error"
      size="panel"
      title={t("storefront.studioStates.manager.loadFailedTitle")}
      description={t("storefront.studioStates.manager.loadFailedBody")}
      onRetry={onRetry}
      testId="manager-load-error"
    />
  );
}
