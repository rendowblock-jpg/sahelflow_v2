"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  ArrowUp,
  ImagePlus,
  Loader2,
  Slash,
  Square,
} from "lucide-react";

import {
  matchesQuickJob,
  type AiQuickJob,
} from "@/components/ai/ai-quick-jobs";
import {
  AiComposerEditNotice,
  AiComposerFooter,
  AiShortcutsPopover,
} from "@/components/ai/ai-shortcuts-popover";
import { AiSlashMenu } from "@/components/ai/ai-slash-menu";
import {
  AiDropOverlay,
  AiScreenshotChip,
  SCREENSHOT_ACCEPT,
  useAiScreenshotAttachment,
} from "@/components/ai/ai-screenshot-attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import {
  AI_CHAT_COUNTER_VISIBLE_SHARE,
  AI_CHAT_MESSAGE_MAX_LENGTH,
} from "@/lib/ai/chat-limits";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

/**
 * The composer. One component in two placements: `hero` sits in the middle of
 * a new chat as the page's main control; `docked` sits under a conversation.
 *
 * - "/" at the start of an empty line (or the slash button) opens the quick
 *   jobs, filtered as the seller types; ↑/↓ move, Enter or Tab insert, Esc
 *   closes. Picking a job writes its prompt into the draft — never sends it.
 * - Screenshots arrive by button, paste or drop and are read into the draft
 *   for review (AI-21, `ai-screenshot-attachment.tsx`).
 * - The draft is owned by the canvas — deep-link prefill, edit prefill,
 *   follow-up chips and quick jobs all write it — so the deck receives
 *   `draft`/`setDraft`/`composerRef` rather than keeping a second copy.
 */
export function AiComposerDeck({
  workspace,
  draft,
  setDraft,
  composerRef,
  setupReady,
  sending,
  startingAnalysis,
  editing,
  stop,
  onCancelEdit,
  onSubmit,
  quickJobs,
  variant = "docked",
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  setupReady: boolean;
  sending: boolean;
  startingAnalysis: boolean;
  /** Edit mode is owned by the workspace hook; the deck only renders it. */
  editing: boolean;
  stop: () => void;
  onCancelEdit: () => void;
  onSubmit: () => void | Promise<void>;
  quickJobs: AiQuickJob[];
  variant?: "hero" | "docked";
}) {
  const { t } = useI18n();
  const { copy, locale } = workspace;
  const menuId = useId();
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const [menuFromButton, setMenuFromButton] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const { screenshot, readingScreenshot, ingestScreenshot, clearScreenshot } =
    useAiScreenshotAttachment({ copy, setDraft, composerRef });
  // Ledger AI-17 residual: the counter owns the last stretch before the
  // bound — an always-visible counter is noise for the common short prompt.
  const counterVisibleFrom = Math.ceil(
    AI_CHAT_MESSAGE_MAX_LENGTH * AI_CHAT_COUNTER_VISIBLE_SHARE,
  );
  const inputLocked = !setupReady || sending || startingAnalysis;
  const hero = variant === "hero";

  const slashQuery =
    !editing && draft.startsWith("/") && !draft.includes("\n")
      ? draft.slice(1)
      : null;
  const menuOpen = !inputLocked && (menuFromButton || slashQuery !== null);
  const filteredJobs = useMemo(
    () =>
      menuOpen
        ? quickJobs.filter((job) => matchesQuickJob(job, slashQuery ?? ""))
        : [],
    [menuOpen, quickJobs, slashQuery],
  );
  const activeIndex = Math.min(menuIndex, Math.max(filteredJobs.length - 1, 0));

  const closeMenu = () => {
    setMenuFromButton(false);
    setMenuIndex(0);
  };

  const pickJob = (job: AiQuickJob) => {
    setDraft(job.prompt);
    closeMenu();
    composerRef.current?.focus();
  };

  const sendDisabled =
    !setupReady || !draft.trim() || startingAnalysis || readingScreenshot;

  const acceptsDrop = setupReady && !sending && !readingScreenshot;

  return (
    <div
      data-ai-composer-deck="true"
      data-ai-composer-variant={variant}
      className={cn("shrink-0", hero ? "w-full" : "pb-3 pt-2")}
    >
      <div className={cn(!hero && "sf-ai-column")}>
        {editing ? (
          <AiComposerEditNotice
            notice={copy("editingNotice")}
            cancelLabel={copy("cancelEdit")}
            onCancel={onCancelEdit}
          />
        ) : null}
        {screenshot ? (
          <AiScreenshotChip
            screenshot={screenshot}
            reading={readingScreenshot}
            copy={copy}
            onRemove={clearScreenshot}
          />
        ) : null}
        <div className="relative">
          <div
            data-ai-composer="true"
            onDragOver={(event) => {
              if (!acceptsDrop || !event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragging(false);
              }
            }}
            onDrop={(event) => {
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (!file || !acceptsDrop) return;
              event.preventDefault();
              ingestScreenshot(file);
            }}
            className={cn(
              "relative rounded-surface border bg-card shadow-(--elevation-1) transition",
              "focus-within:border-ring/60 focus-within:shadow-(--elevation-2)",
              dragging ? "border-primary border-dashed" : "border-border",
            )}
          >
            <input
              ref={screenshotInputRef}
              type="file"
              accept={SCREENSHOT_ACCEPT}
              aria-label={copy("attachScreenshot")}
              className="sr-only"
              tabIndex={-1}
              data-ai-screenshot-input="true"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                if (file) ingestScreenshot(file);
              }}
            />
            <Textarea
              ref={composerRef}
              value={draft}
              role="combobox"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                menuOpen && filteredJobs[activeIndex]
                  ? `${menuId}-${filteredJobs[activeIndex].id}`
                  : undefined
              }
              onChange={(event) => {
                setDraft(event.target.value);
                setMenuIndex(0);
              }}
              onBlur={() => setMenuFromButton(false)}
              onPaste={(event) => {
                // Ledger AI-21: screenshots arrive as paste too (WhatsApp/
                // Facebook screenshot workflows); one decision per image.
                const file = event.clipboardData?.files?.[0];
                if (file && setupReady && !sending && !readingScreenshot) {
                  event.preventDefault();
                  ingestScreenshot(file);
                }
              }}
              onKeyDown={(event) => {
                if (menuOpen) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    if (filteredJobs.length === 0) return;
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    setMenuIndex(
                      (activeIndex + step + filteredJobs.length) % filteredJobs.length,
                    );
                    return;
                  }
                  if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
                    const job = filteredJobs[activeIndex];
                    if (job) {
                      event.preventDefault();
                      pickJob(job);
                      return;
                    }
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (slashQuery !== null) setDraft("");
                    closeMenu();
                    return;
                  }
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              placeholder={copy("composerPlaceholder")}
              aria-label={copy("composerPlaceholder")}
              rows={hero ? 2 : 1}
              dir="auto"
              maxLength={AI_CHAT_MESSAGE_MAX_LENGTH}
              disabled={inputLocked}
              className={cn(
                "w-full resize-none rounded-none border-0 bg-transparent px-4 pb-1 text-body shadow-none outline-none dark:bg-transparent focus-visible:border-transparent focus-visible:ring-0",
                hero ? "max-h-80 min-h-20 pt-4" : "max-h-60 min-h-12 pt-3",
              )}
            />
            <div className="flex items-center gap-1 px-2 pb-2">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={copy("attachScreenshot")}
                title={copy("attachScreenshot")}
                data-ai-composer-attach="true"
                disabled={inputLocked || readingScreenshot}
                onClick={() => screenshotInputRef.current?.click()}
                className="text-muted-foreground hover:text-foreground"
              >
                {readingScreenshot ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="size-4" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={getAiDecisionCopy(locale, "quickJobs")}
                title={getAiDecisionCopy(locale, "quickJobsHint")}
                data-ai-quick-jobs-button="true"
                aria-pressed={menuOpen}
                disabled={inputLocked}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (menuOpen) {
                    closeMenu();
                  } else {
                    setMenuFromButton(true);
                    setMenuIndex(0);
                  }
                  composerRef.current?.focus();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Slash className="size-4" aria-hidden="true" />
              </Button>
              <span className="flex-1" />
              {draft.length >= counterVisibleFrom ? (
                // Ledger AI-17 residual: honest near-limit counter, one bound
                // with both server schemas (chat-limits.ts). Numbers stay LTR.
                <span
                  data-ai-composer-counter="true"
                  dir="ltr"
                  className={cn(
                    "px-1.5 text-caption tabular-nums",
                    draft.length >= AI_CHAT_MESSAGE_MAX_LENGTH
                      ? "font-semibold text-warning"
                      : "text-muted-foreground",
                  )}
                >
                  {getAiDecisionCopy(locale, "composerCounter", {
                    count: draft.length,
                    max: AI_CHAT_MESSAGE_MAX_LENGTH,
                  })}
                </span>
              ) : null}
              {sending ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={copy("stop")}
                  title={copy("stop")}
                  className="size-8 rounded-full"
                  onClick={stop}
                >
                  <Square className="size-3 fill-current" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  aria-label={copy("send")}
                  title={copy("send")}
                  data-ai-send="true"
                  disabled={sendDisabled}
                  className="size-8 rounded-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                  onClick={() => void onSubmit()}
                >
                  {startingAnalysis ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowUp className="size-4" aria-hidden="true" />
                  )}
                </Button>
              )}
            </div>
            {dragging ? (
              <AiDropOverlay label={getAiDecisionCopy(locale, "dropScreenshot")} />
            ) : null}
          </div>
          {menuOpen ? (
            <AiSlashMenu
              id={menuId}
              title={getAiDecisionCopy(locale, "quickJobs")}
              emptyLabel={getAiDecisionCopy(locale, "quickJobsEmpty")}
              jobs={filteredJobs}
              activeIndex={activeIndex}
              placement={hero ? "below" : "above"}
              onHover={setMenuIndex}
              onPick={pickJob}
            />
          ) : null}
        </div>
        <AiComposerFooter
          trust={getAiDecisionCopy(locale, "composerTrust")}
          sendLabel={getAiDecisionCopy(locale, "composerHintSend")}
          newlineLabel={getAiDecisionCopy(locale, "composerHintNewline")}
        >
          <AiShortcutsPopover
            copy={copy}
            label={t("common.cheatsheet")}
            leading={[
              ["Ctrl+Shift+O", getAiDecisionCopy(locale, "shortcutNewChat")],
              ["Ctrl+Shift+S", getAiDecisionCopy(locale, "shortcutToggleSidebar")],
              ["/", getAiDecisionCopy(locale, "quickJobs")],
            ]}
          />
        </AiComposerFooter>
      </div>
    </div>
  );
}
