"use client";

import type { ReactNode } from "react";
import { Keyboard, ShieldCheck } from "lucide-react";

import type { AiCopyFn } from "@/components/ai/ai-workspace-types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SHORTCUTS = [
  ["/", "shortcutFocusComposer"],
  ["Esc", "shortcutStopStream"],
  ["Alt+↑↓", "shortcutSwitchSessions"],
  ["Ctrl+↵", "shortcutApproveFocused"],
] as const;

/**
 * UI-03 — the canvas keyboard reference, on demand. A list the seller reads
 * once does not earn a standing row under the field they type into daily, so
 * it sits behind one small keyboard control beside the composer hint.
 */
export function AiShortcutsPopover({
  copy,
  label,
  leading = [],
}: {
  copy: AiCopyFn;
  label: string;
  /** Workspace-level shortcuts listed before the canvas ones: [keys, label]. */
  leading?: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex size-6 items-center justify-center rounded-control outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Keyboard className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-72 p-3">
        <p className="text-caption font-medium text-muted-foreground">{label}</p>
        <dl className="mt-2 space-y-1.5 text-body-sm">
          {[
            ...leading,
            ...SHORTCUTS.map(([keys, key]) => [keys, copy(key)] as const),
          ].map(([keys, text]) => (
            <div key={`${keys}-${text}`} className="flex items-center justify-between gap-3">
              <dt>{text}</dt>
              <dd dir="ltr">
                <kbd className="rounded-control border border-border bg-muted px-1.5 py-0.5 font-sans text-caption">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** Ledger AI-15: the slim "editing a sent message" notice above the composer. */
export function AiComposerEditNotice({
  notice,
  cancelLabel,
  onCancel,
}: {
  notice: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <div
      data-ai-editing="true"
      className="mb-2 flex items-center justify-between gap-3 rounded-surface border border-warning/30 bg-warning-subtle px-3.5 py-2"
    >
      <p className="min-w-0 truncate text-body-sm text-foreground">{notice}</p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 text-caption"
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
    </div>
  );
}

/**
 * The quiet line under the composer: the approval promise on one side, the
 * send gesture and the keyboard reference on the other (desktop widths).
 */
const KBD =
  "rounded-control border border-border bg-muted px-1 py-px font-sans text-caption";

export function AiComposerFooter({
  trust,
  sendLabel,
  newlineLabel,
  children,
}: {
  trust: string;
  sendLabel: string;
  newlineLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 px-1 text-caption text-muted-foreground">
      <p className="flex min-w-0 items-center gap-1.5">
        <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">{trust}</span>
      </p>
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        {/* Key names stay LTR-isolated so an Arabic hint never reorders them. */}
        <span className="flex items-center gap-1">
          <kbd dir="ltr" className={KBD}>Enter</kbd>
          {sendLabel}
        </span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1">
          <kbd dir="ltr" className={KBD}>Shift+Enter</kbd>
          {newlineLabel}
        </span>
        {children}
      </div>
    </div>
  );
}
