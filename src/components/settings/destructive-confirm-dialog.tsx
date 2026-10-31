"use client";

import { useId, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

import { canConfirmDestructive } from "./destructive-confirm";

export interface DestructiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What the seller will lose, in plain words. */
  lost: string;
  /** What this does NOT touch (backups, orders already imported...). */
  notAffected: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  /** Set when seller data is lost: the confirm button stays off until it is typed. */
  confirmWord?: string;
  /** A calm sentence for a failed attempt; the dialog stays open. */
  error?: string | null;
  /** The caller's own request is running. */
  busy?: boolean;
}

/**
 * The one confirm dialog for destructive settings actions. Focus starts on Cancel (Radix
 * AlertDialog), Escape closes it, the confirm button is a plain button so a failure keeps the
 * dialog open, and a lock stops a second click while the first request runs.
 */
export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  title,
  lost,
  notAffected,
  confirmLabel,
  onConfirm,
  confirmWord,
  error,
  busy: externalBusy = false,
}: DestructiveConfirmDialogProps) {
  const { t } = useI18n();
  const inputId = useId();
  const errorId = useId();
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const lock = useRef(false);
  const busy = running || externalBusy;
  const allowed = canConfirmDestructive({ word: confirmWord, typed, busy });

  async function run() {
    if (lock.current) return;
    if (!canConfirmDestructive({ word: confirmWord, typed, busy: false })) return;
    lock.current = true;
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      lock.current = false;
      setRunning(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && (lock.current || externalBusy)) return;
    if (!next) setTyped("");
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-start">
              <p>
                <span className="block text-xs font-semibold text-destructive">
                  {t("settings.destructive.lostLabel")}
                </span>
                <span className="block text-sm text-foreground">{lost}</span>
              </p>
              <p>
                <span className="block text-xs font-semibold text-muted-foreground">
                  {t("settings.destructive.notAffectedLabel")}
                </span>
                <span className="block text-sm text-foreground">{notAffected}</span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmWord !== undefined ? (
          <div className="space-y-1.5">
            <Label htmlFor={inputId} className="text-xs">
              {t("settings.destructive.typePrompt", { word: confirmWord })}
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void run();
                }
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              dir="ltr"
              disabled={busy}
              aria-describedby={error ? errorId : undefined}
              className="[@media(pointer:coarse)]:min-h-11"
            />
          </div>
        ) : null}

        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="[@media(pointer:coarse)]:min-h-11">
            {t("settings.destructive.cancel")}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void run()}
            disabled={!allowed}
            aria-busy={busy}
            className="[@media(pointer:coarse)]:min-h-11"
          >
            {busy ? t("settings.destructive.working") : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
