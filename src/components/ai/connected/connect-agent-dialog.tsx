"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";

import { IconTile } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  connectedAgentsErrorCode,
  type ConnectedAgentsState,
  type GrantableTool,
} from "@/hooks/use-connected-agents";
import { getAiToolGroupLabel, getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import {
  getConnectedAgentsCopy,
  type ConnectedAgentsCopyKey,
  type ConnectedAgentsLocale,
} from "@/lib/i18n/connected-agents";
import { cn } from "@/lib/utils";

function toolBadge(tool: GrantableTool): ConnectedAgentsCopyKey {
  if (tool.executionClass === "sensitive") return "badgeApproval";
  if (tool.executionClass === "external_read") return "badgeExternal";
  return "badgeRead";
}

function groupTools(catalog: GrantableTool[]): Array<[string, GrantableTool[]]> {
  const groups = new Map<string, GrantableTool[]>();
  for (const tool of catalog) {
    const list = groups.get(tool.group) ?? [];
    list.push(tool);
    groups.set(tool.group, list);
  }
  return [...groups.entries()];
}

export function ConnectAgentDialog({
  open,
  onOpenChange,
  agents,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: ConnectedAgentsState;
  locale: ConnectedAgentsLocale;
}) {
  const copy = (key: ConnectedAgentsCopyKey, params?: Record<string, string | number>) =>
    getConnectedAgentsCopy(locale, key, params);
  const [label, setLabel] = React.useState("");
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const groups = React.useMemo(() => groupTools(agents.catalog), [agents.catalog]);
  const readOnly = React.useMemo(
    () => agents.catalog.filter((tool) => tool.executionClass !== "sensitive").map((tool) => tool.name),
    [agents.catalog],
  );

  const reset = () => {
    setLabel("");
    setSelected(new Set());
    setError(null);
    setSecret(null);
    setCopied(false);
    setSubmitting(false);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggle = (name: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !label.trim() || selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await agents.connect(label.trim(), [...selected]);
      setSecret(created.secret);
    } catch (failure) {
      setError(
        connectedAgentsErrorCode(failure) === "MCP_GRANT_LIMIT_REACHED"
          ? copy("limitReached")
          : copy("actionFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard permission denied: the key stays selectable on screen.
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl" data-connect-agent-dialog="true">
        {secret ? (
          <div className="space-y-5 p-6">
            <DialogHeader className="items-start gap-3 text-start">
              <IconTile icon={KeyRound} tone="warning" size="md" />
              <DialogTitle className="text-title-2">{copy("secretTitle")}</DialogTitle>
              <DialogDescription className="text-body-sm">
                {copy("secretDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-surface border border-border bg-muted/40 p-2 ps-3">
              <code
                dir="ltr"
                data-agent-secret="true"
                className="min-w-0 flex-1 select-all truncate font-mono text-body-sm text-foreground"
              >
                {secret}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copySecret()}>
                {copied ? (
                  <Check className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                {copied ? copy("copied") : copy("copy")}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => close(false)}>
                {copy("done")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} data-connect-agent-form="true"
            className="flex flex-col">
            <DialogHeader className="space-y-1.5 border-b border-border/70 p-6 pb-4 text-start">
              <DialogTitle className="text-title-2">{copy("dialogTitle")}</DialogTitle>
              <DialogDescription className="text-body-sm">
                {copy("dialogDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              <div className="space-y-2">
                <label htmlFor="connect-agent-name" className="text-body-sm font-medium">
                  {copy("nameLabel")}
                </label>
                <Input
                  id="connect-agent-name"
                  value={label}
                  maxLength={64}
                  autoComplete="off"
                  placeholder={copy("namePlaceholder")}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </div>

              <fieldset className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="text-body-sm font-medium">
                    {copy("toolsLabel")}
                    <span className="ms-2 font-normal text-muted-foreground tabular-nums">
                      {copy("toolsSelected", { count: selected.size })}
                    </span>
                  </legend>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set(readOnly))}>
                      {copy("presetReadOnly")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected(new Set(agents.catalog.map((tool) => tool.name)))}
                    >
                      {copy("presetAll")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      {copy("presetClear")}
                    </Button>
                  </div>
                </div>

                <div className="divide-y divide-border/70 rounded-surface border border-border">
                  {groups.map(([group, tools]) => (
                    <div key={group} className="px-3 py-2.5">
                      <p className="pb-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                        {getAiToolGroupLabel(locale, group)}
                      </p>
                      <div className="grid gap-0.5 sm:grid-cols-2">
                        {tools.map((tool) => {
                          const id = `grant-tool-${tool.name}`;
                          const badge = toolBadge(tool);
                          return (
                            <label
                              key={tool.name}
                              htmlFor={id}
                              className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-muted/60"
                            >
                              <Checkbox
                                id={id}
                                checked={selected.has(tool.name)}
                                onCheckedChange={(value) => toggle(tool.name, value === true)}
                              />
                              <span className="min-w-0 flex-1 truncate text-body-sm">
                                {getAiToolLabel(locale, tool.name)}
                              </span>
                              {badge !== "badgeRead" ? (
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium",
                                    badge === "badgeApproval"
                                      ? "bg-warning-subtle text-warning"
                                      : "bg-info-subtle text-info",
                                  )}
                                >
                                  {copy(badge)}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              {error ? (
                <p role="alert" className="text-body-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border/70 p-4">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                {copy("cancel")}
              </Button>
              <Button type="submit" disabled={submitting || !label.trim() || selected.size === 0}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {submitting ? copy("creating") : copy("create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
