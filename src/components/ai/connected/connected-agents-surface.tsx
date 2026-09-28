"use client";

import * as React from "react";
import { ArrowLeft, Bot, Loader2, Plug, Plus, RefreshCw } from "lucide-react";

import { AgentActivityList } from "@/components/ai/connected/agent-activity-list";
import { ConnectAgentDialog } from "@/components/ai/connected/connect-agent-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { IconTile, StateSurface } from "@/components/system";
import { Button } from "@/components/ui/button";
import type {
  ConnectedAgentGrant,
  ConnectedAgentsState,
} from "@/hooks/use-connected-agents";
import {
  getConnectedAgentsCopy,
  type ConnectedAgentsCopyKey,
  type ConnectedAgentsLocale,
} from "@/lib/i18n/connected-agents";
import { toast } from "@/lib/toast";
import { cn, formatRelative } from "@/lib/utils";

/**
 * Connected agents (FD-063, MCP-13): the control surface for external MCP
 * agents inside the Agents workspace.
 *
 * It shows who may act (grants), what each may do (tool count, key hint,
 * status), and what they did (the audited invocation log). Approvals are not
 * re-implemented here: a sensitive call produces a proposal in the agent's
 * own work-history session, and "Review" opens that session, where the one
 * approval authority already lives.
 */
export function ConnectedAgentsSurface({
  agents,
  locale,
  onOpenSession,
  onBack,
}: {
  agents: ConnectedAgentsState;
  locale: ConnectedAgentsLocale;
  onOpenSession: (sessionId: string) => void;
  /** Mobile only: return to the history rail. */
  onBack?: () => void;
}) {
  const copy = (key: ConnectedAgentsCopyKey, params?: Record<string, string | number>) =>
    getConnectedAgentsCopy(locale, key, params);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<ConnectedAgentGrant | null>(null);

  const agentNames = React.useMemo(
    () => new Map(agents.grants.map((grant) => [grant.id, grant.label])),
    [agents.grants],
  );

  const confirmRevoke = async () => {
    if (!revoking) return;
    try {
      await agents.revoke(revoking.id);
      toast.success(copy("revoked", { name: revoking.label }));
    } catch {
      toast.error(copy("actionFailed"));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section
      data-connected-agents="true"
      aria-labelledby="connected-agents-title"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {onBack ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="-ms-2 shrink-0"
              aria-label={copy("agentsSection")}
              onClick={onBack}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
          ) : null}
          <IconTile icon={Plug} tone="primary" size="md" />
          <div className="min-w-0 space-y-1">
            <h2 id="connected-agents-title" className="text-title-2">
              {copy("title")}
            </h2>
            <p className="max-w-2xl text-body-sm text-muted-foreground">
              {copy("description")}
            </p>
          </div>
        </div>
        {agents.canManage ? (
          <Button type="button" onClick={() => setDialogOpen(true)} disabled={agents.loading}>
            <Plus className="size-4" aria-hidden="true" />
            {copy("connect")}
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-6">
          {agents.loading ? (
            <div className="flex items-center gap-2 text-body-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy("title")}
            </div>
          ) : agents.failed ? (
            <StateSurface
              icon={Plug}
              tone="danger"
              size="panel"
              title={copy("loadFailed")}
              actions={
                <Button type="button" variant="outline" onClick={() => void agents.reload()}>
                  <RefreshCw className="size-4" aria-hidden="true" />
                  {copy("retry")}
                </Button>
              }
            />
          ) : (
            <>
              {!agents.canManage ? (
                <p className="rounded-surface bg-muted/50 px-4 py-3 text-body-sm text-muted-foreground">
                  {copy("readOnlyNotice")}
                </p>
              ) : null}

              <section aria-labelledby="connected-agents-list" className="space-y-3">
                <h3 id="connected-agents-list" className="text-title-3">
                  {copy("agentsSection")}
                </h3>
                {agents.grants.length === 0 ? (
                  <StateSurface
                    icon={Bot}
                    size="panel"
                    title={copy("emptyAgentsTitle")}
                    description={copy("emptyAgentsDescription")}
                    actions={
                      agents.canManage ? (
                        <Button type="button" onClick={() => setDialogOpen(true)}>
                          <Plus className="size-4" aria-hidden="true" />
                          {copy("connect")}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <ul className="divide-y divide-border/70 rounded-surface border border-border bg-card">
                    {agents.grants.map((grant) => (
                      <AgentRow
                        key={grant.id}
                        grant={grant}
                        locale={locale}
                        canManage={agents.canManage}
                        onRevoke={() => setRevoking(grant)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="connected-agents-activity" className="space-y-3">
                <div className="space-y-1">
                  <h3 id="connected-agents-activity" className="text-title-3">
                    {copy("activitySection")}
                  </h3>
                  <p className="text-body-sm text-muted-foreground">{copy("activityDescription")}</p>
                </div>
                <div className="rounded-surface border border-border bg-card">
                  <AgentActivityList
                    invocations={agents.invocations}
                    agentNames={agentNames}
                    locale={locale}
                    onOpenReview={onOpenSession}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <ConnectAgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agents={agents}
        locale={locale}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={copy("revokeTitle", { name: revoking?.label ?? "" })}
        description={copy("revokeDescription")}
        confirmLabel={copy("revokeConfirm")}
        cancelLabel={copy("cancel")}
        destructive
        onConfirm={confirmRevoke}
      />
    </section>
  );
}

function AgentRow({
  grant,
  locale,
  canManage,
  onRevoke,
}: {
  grant: ConnectedAgentGrant;
  locale: ConnectedAgentsLocale;
  canManage: boolean;
  onRevoke: () => void;
}) {
  const copy = (key: ConnectedAgentsCopyKey, params?: Record<string, string | number>) =>
    getConnectedAgentsCopy(locale, key, params);
  const active = grant.status === "active";
  const client = [grant.lastClientName, grant.lastClientVersion].filter(Boolean).join(" ");

  return (
    <li
      data-agent-grant={grant.status}
      className={cn("flex min-w-0 items-center gap-3 px-4 py-3.5", !active && "opacity-70")}
    >
      <IconTile icon={Bot} tone={active ? "primary" : "neutral"} size="sm" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <bdi dir="auto" className="truncate text-body-sm font-semibold text-foreground">
            {grant.label}
          </bdi>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-caption font-medium",
              active ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {active ? copy("statusActive") : copy("statusRevoked")}
          </span>
        </div>
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
          <span>
            {grant.lastUsedAt
              ? copy("lastActive", { time: formatRelative(grant.lastUsedAt, locale) })
              : copy("neverConnected")}
          </span>
          {client ? (
            <>
              <span aria-hidden="true">·</span>
              <bdi dir="ltr">{client}</bdi>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{copy("toolCount", { count: grant.tools.length })}</span>
          <span aria-hidden="true">·</span>
          <span>{copy("keyHint", { hint: `…${grant.secretHint}` })}</span>
        </p>
      </div>
      {active && canManage ? (
        <Button type="button" size="sm" variant="ghost" className="shrink-0 text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={onRevoke}>
          {copy("revoke")}
        </Button>
      ) : null}
    </li>
  );
}
