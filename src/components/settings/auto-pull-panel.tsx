"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import { getAutoPullCopy } from "@/lib/i18n/auto-pull";
import { toast } from "@/lib/toast";

/**
 * The seller's off switch for the scheduled pull (INT-03). One panel per kind:
 * "courier" sits on the delivery page, "commerce" on the shop page.
 *
 * The switch shows what the SERVER says. It is disabled and unchecked until the
 * server has answered, never a guessed "on"; it moves only when a save is
 * answered, and it follows the answer rather than the request.
 */

const ENDPOINT = "/api/integrations/auto-pull";

type Kind = "courier" | "commerce";
type Phase = "loading" | "ready" | "failed";

function readSwitch(data: unknown, kind: Kind): boolean | null {
  if (!data || typeof data !== "object") return null;
  const switches = (data as { switches?: Record<string, unknown> }).switches;
  const value = switches?.[kind];
  return typeof value === "boolean" ? value : null;
}

function readCanManage(data: unknown, kind: Kind): boolean {
  const canManage = (data as { canManage?: Record<string, unknown> } | null)?.canManage;
  return canManage?.[kind] !== false;
}

export function AutoPullPanel({ kind, canManage }: { kind: Kind; canManage: boolean }) {
  const { locale } = useI18n();
  const copy = getAutoPullCopy(locale);
  const text = copy[kind];
  const [phase, setPhase] = useState<Phase>("loading");
  const [value, setValue] = useState<boolean | null>(null);
  const [serverAllows, setServerAllows] = useState(true);
  const [saving, setSaving] = useState(false);
  const manageable = canManage && serverAllows;
  const switchId = `auto-pull-${kind}`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      const current = readSwitch(data, kind);
      if (!response.ok || current === null) throw new Error("unreadable");
      setValue(current);
      setServerAllows(readCanManage(data, kind));
      setPhase("ready");
    } catch {
      setPhase("failed");
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(next: boolean) {
    if (saving || phase !== "ready" || !manageable) return;
    setSaving(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kind]: next }),
      });
      const data: unknown = await response.json().catch(() => null);
      const answered = readSwitch(data, kind);
      if (!response.ok || answered === null) throw new Error("not saved");
      setValue(answered);
      if (answered === next) toast.success(copy.saved);
      else toast.error(copy.failed);
    } catch {
      toast.error(copy.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel data-auto-pull={kind} className="p-5">
      <PanelHeader>
        <div className="min-w-0">
          <PanelTitle>{text.title}</PanelTitle>
          <PanelDescription>{text.description}</PanelDescription>
        </div>
      </PanelHeader>

      {phase === "failed" ? (
        <div className="flex items-center justify-between gap-3 rounded-surface border border-warning/30 bg-warning-subtle p-3 text-body-sm">
          <span>{copy.failed}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPhase("loading");
              void load();
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {copy.retry}
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/70 rounded-surface border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <Label htmlFor={switchId} className="text-body-sm">
              {text.label}
            </Label>
            <Switch
              id={switchId}
              checked={value === true}
              onCheckedChange={(next) => void change(next)}
              disabled={phase !== "ready" || saving || !manageable}
            />
          </div>
          <p className="px-3 py-2 text-body-sm text-muted-foreground" aria-live="polite">
            {phase === "loading"
              ? copy.loading
              : value === false
                ? text.offHint
                : text.onHint}
            {phase === "ready" && !manageable ? ` ${copy.readOnly}` : ""}
          </p>
        </div>
      )}
    </Panel>
  );
}
