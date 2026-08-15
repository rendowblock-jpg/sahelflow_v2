"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardCheck,
  PackageSearch,
  RotateCcw,
} from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  getAiWorkspaceCopy,
  type AiWorkspaceCopyKey,
  type AiWorkspaceLocale,
} from "@/lib/i18n/ai-workspace";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type TaskId = "pending" | "revenue" | "returns" | "products";

type Task = {
  id: TaskId;
  title: AiWorkspaceCopyKey;
  description: AiWorkspaceCopyKey;
  prompt: AiWorkspaceCopyKey;
  icon: typeof ClipboardCheck;
};

const TASKS: readonly Task[] = [
  {
    id: "pending",
    title: "launchPendingTitle",
    description: "launchPendingDescription",
    prompt: "launchPendingPrompt",
    icon: ClipboardCheck,
  },
  {
    id: "revenue",
    title: "launchRevenueTitle",
    description: "launchRevenueDescription",
    prompt: "launchRevenuePrompt",
    icon: CircleDollarSign,
  },
  {
    id: "returns",
    title: "launchReturnsTitle",
    description: "launchReturnsDescription",
    prompt: "launchReturnsPrompt",
    icon: RotateCcw,
  },
  {
    id: "products",
    title: "launchProductsTitle",
    description: "launchProductsDescription",
    prompt: "launchProductsPrompt",
    icon: PackageSearch,
  },
] as const;

type SetupResponse = {
  ready?: boolean;
  consentAccepted?: boolean;
  keyConfigured?: boolean;
};

function localizedSetupFailure(
  setup: SetupResponse,
  copy: (key: AiWorkspaceCopyKey) => string,
): string {
  if (setup.consentAccepted === false) return copy("consentMissing");
  if (setup.keyConfigured === false) return copy("keyMissing");
  return copy("providerDegraded");
}

export function AiOperationalLaunchpad() {
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as AiWorkspaceLocale;
  const copy = (key: AiWorkspaceCopyKey) => getAiWorkspaceCopy(locale, key);
  const [starting, setStarting] = useState<TaskId | null>(null);

  async function launch(task: Task) {
    if (starting) return;
    setStarting(task.id);

    try {
      const setupResponse = await fetch("/api/ai/status", { cache: "no-store" });
      const setup = (await setupResponse.json().catch(() => ({}))) as SetupResponse;
      if (!setupResponse.ok || setup.ready !== true) {
        toast.error(localizedSetupFailure(setup, copy));
        return;
      }

      toast.info(copy("launchStarting"));
      const sessionResponse = await fetch("/api/ai/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: copy(task.title) }),
      });
      const sessionBody = (await sessionResponse.json().catch(() => ({}))) as {
        session?: { id?: string };
      };
      const sessionId = sessionBody.session?.id;
      if (!sessionResponse.ok || !sessionId) {
        throw new Error(copy("sessionCreateFailed"));
      }

      const messageResponse = await fetch(
        `/api/ai/sessions/${encodeURIComponent(sessionId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: copy(task.prompt),
            locale,
          }),
        },
      );
      if (!messageResponse.ok) {
        const body = (await messageResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        if (body.error === "consent_required" || body.error === "AI_CONSENT_REQUIRED") {
          throw new Error(copy("consentMissing"));
        }
        if (body.error === "AI_RATE_LIMITED") {
          throw new Error(copy("rateLimited"));
        }
        if (body.error === "AI_LICENSE_REQUIRED") {
          throw new Error(copy("licenseRequired"));
        }
        throw new Error(copy("launchFailed"));
      }

      // The sessions API sorts by the latest durable activity. A normal reload
      // therefore opens the focused session through the same workspace authority
      // instead of maintaining a second client-side chat state here.
      window.location.assign("/agents");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy("launchFailed"));
    } finally {
      setStarting(null);
    }
  }

  return (
    <section
      data-ai-launchpad="operational"
      className="rounded-xl border bg-card/70 p-3 shadow-sm"
      aria-labelledby="ai-launchpad-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-1 pb-3">
        <div>
          <h2 id="ai-launchpad-title" className="text-sm font-semibold">
            {copy("launchTitle")}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {copy("launchDescription")}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {TASKS.map((task) => {
          const Icon = task.icon;
          const active = starting === task.id;
          return (
            <button
              key={task.id}
              type="button"
              disabled={starting !== null}
              onClick={() => void launch(task)}
              className={cn(
                "group flex min-h-24 items-start gap-3 rounded-lg border bg-background px-3 py-3 text-start transition",
                "hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                "disabled:cursor-wait disabled:opacity-60",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/7 text-primary">
                <Icon
                  className={cn("size-4", active && "animate-pulse")}
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{copy(task.title)}</span>
                  <ArrowUpRight
                    className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {copy(task.description)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
