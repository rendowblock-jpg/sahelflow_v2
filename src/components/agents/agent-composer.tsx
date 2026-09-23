"use client";

/**
 * Agent composer — premium input with auto-resize, keyboard shortcuts,
 * and send state. Glass morphism with gradient focus ring.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";

import { getAgentCopy, type AgentLocale } from "@/lib/i18n/agent-workspace";

export function AgentComposer({
  onSend,
  onStop,
  sending,
  placeholder,
  initialValue = "",
  locale = "en",
}: {
  onSend: (message: string) => Promise<boolean>;
  onStop?: () => void;
  sending: boolean;
  placeholder?: string;
  initialValue?: string;
  locale?: AgentLocale;
}) {
  const { t } = getAgentCopy(locale);
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Sync initial value changes (deep link prefill)
  useEffect(() => {
    if (initialValue && initialValue !== value) {
      setValue(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setValue("");
    await onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Escape clears
    if (e.key === "Escape" && !value) {
      textareaRef.current?.blur();
    }
  };

  return (
    <div className="agent-glass rounded-[var(--agent-radius-xl)] transition-shadow focus-within:shadow-[var(--agent-glow-sm)]">
      <div className="flex items-end gap-2 p-3">
        {/* Attach button */}
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--agent-text-tertiary)] transition-colors hover:bg-[var(--agent-surface-3)] hover:text-[var(--agent-text-secondary)]"
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t("placeholder")}
          rows={1}
          className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-[var(--agent-text-primary)] placeholder:text-[var(--agent-text-tertiary)] focus:outline-none"
          disabled={sending}
        />

        {/* Send / Stop button */}
        {sending ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--agent-surface-4)] text-[var(--agent-text-secondary)] transition-colors hover:bg-[var(--agent-error)]/20 hover:text-[var(--agent-error)]"
            title={t("stop")}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[var(--agent-accent-from)] to-[var(--agent-accent-via)] text-white transition-all hover:opacity-90 disabled:opacity-30"
            title={t("send") + " (Enter)"}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="flex items-center justify-between px-4 pb-2 text-[10px] text-[var(--agent-text-tertiary)]">
        <span>
          <kbd className="rounded bg-[var(--agent-surface-3)] px-1 py-0.5 font-mono text-[9px]">Enter</kbd>{" "}
          {t("enterToSend")} ·{" "}
          <kbd className="rounded bg-[var(--agent-surface-3)] px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd>{" "}
          {t("shiftEnter")}
        </span>
        <span>{value.length > 0 ? `${value.length} chars` : ""}</span>
      </div>
    </div>
  );
}
