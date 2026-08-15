"use client";

import { useState } from "react";
import {
  CircleDollarSign,
  ClipboardCheck,
  PackageSearch,
  RotateCcw,
  Sparkles,
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

type AiMessageResponse = {
  response?: string;
  error?: string | null;
  persisted?: boolean;
};

function localizedSetupFailure(
  setup: SetupResponse,
  copy: (key: AiWorkspaceCopyKey) => string,
): string {
  if (setup.consentAccepted === false) return copy("consentMissing");
  if (setup.keyConfigured === false) return copy("keyMissing");
  return copy("providerDegraded");
}

function localizedMessageFailure(
  body: AiMessageResponse,
  copy: (key: AiWorkspaceCopyKey) => string,
): string {
  if (body.error === "consent_required" || body.error === "AI_CONSENT_REQUIRED") {
    return copy("consentMissing");
  }
  if (body.error === "AI_RATE_LIMITED") return copy("rateLimited");
  if (body.error === "AI_LICENSE_REQUIRED") return copy("licenseRequired");
  if (body.persisted === false && body.response) return copy("responseNotPersisted");
  if (body.error) return copy("providerDegraded");
  return copy("launchFailed");
}

export function AiOperationalLaunchpad({
  onSessionCreated,
}: {
  onSessionCreated?: (sessionId: string) => void;
}) {
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
          body: JSON.stringify({ message: copy(task.prompt), locale }),
        },
      );
      const messageBody = (await messageResponse.json().catch(() => ({}))) as AiMessageResponse;
      if (
        !messageResponse.ok ||
        messageBody.error ||
        messageBody.persisted !== true ||
        !messageBody.response
      ) {
        throw new Error(localizedMessageFailure(messageBody, copy));
      }

      onSessionCreated?.(sessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy("launchFailed"));
    } finally {
      setStarting(null);
    }
  }

  return (
    <section
      data-ai-launchpad="operational"
      className="flex min-h-14 shrink-0 items-center gap-2 overflow-x-auto border-b bg-background/92 px-3 py-2 backdrop-blur-sm"
      aria-labelledby="ai-launchpad-title"
    >
      <div className="me-1 hidden shrink-0 items-center gap-2 lg:flex">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/8 text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="ai-launchpad-title" className="text-xs font-semibold">
            {copy("launchTitle")}
          </h2>
          <p className="max-w-48 truncate text-[10px] text-muted-foreground">
            {copy("launchDescription")}
          </p>
        </div>
      </div>

      <div
        className="flex min-w-max flex-1 items-center gap-1.5"
        role="group"
        aria-label={copy("launchTitle")}
      >
        {TASKS.map((task) => {
          const Icon = task.icon;
          const active = starting === task.id;
          return (
            <button
              key={task.id}
              type="button"
              disabled={starting !== null}
              onClick={() => void launch(task)}
              title={copy(task.description)}
              className={cn(
                "group inline-flex min-h-9 items-center gap-2 rounded-lg border border-border/75 bg-card px-2.5 text-start text-xs font-semibold outline-none",
                "transition-[background-color,border-color,color,box-shadow] hover:border-primary/30 hover:bg-primary/[0.035] focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-wait disabled:opacity-60",
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/7 text-primary">
                <Icon
                  className={cn("size-3.5", active && "animate-pulse")}
                  aria-hidden="true"
                />
              </span>
              <span className="whitespace-nowrap">{copy(task.title)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
