"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  Monitor,
  MoreHorizontal,
  Redo2,
  ShieldCheck,
  Smartphone,
  Tablet,
  Undo2,
  UploadCloud,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { cn, DZ_CLOCK, intlLocale } from "@/lib/utils";

import type { StorefrontStudioDevice } from "./studio-types";

export type StudioSaveState = "saved" | "pending" | "saving" | "error" | "conflict";

const DEVICES: ReadonlyArray<{ id: StorefrontStudioDevice; icon: typeof Monitor }> = [
  { id: "desktop", icon: Monitor },
  { id: "tablet", icon: Tablet },
  { id: "mobile", icon: Smartphone },
];

/**
 * The Studio's single command bar: where you are, what the buyer can see,
 * how the draft is doing, and the one primary action (Publish).
 */
export function StudioTopBar({
  storefrontId,
  draft,
  liveSlug,
  device,
  onDevice,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveState,
  dirty,
  savedAt,
  onActiveChange,
  onValidate,
  onSave,
  onPublish,
  publishDisabled,
}: {
  storefrontId: string;
  draft: StorefrontStudioDraft;
  liveSlug: string;
  device: StorefrontStudioDevice;
  onDevice: (device: StorefrontStudioDevice) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveState: StudioSaveState;
  dirty: boolean;
  savedAt: Date | null;
  onActiveChange: (active: boolean) => void;
  onValidate: () => void;
  onSave: () => void;
  onPublish: () => void;
  publishDisabled: boolean;
}) {
  const { t } = useI18n();
  const storeHref = `/storefront/${encodeURIComponent(liveSlug)}`;

  return (
    <header
      data-studio-top-bar="true"
      className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3"
    >
      <Link
        href="/storefronts"
        aria-label={t("storefront.builder.back")}
        title={t("storefront.builder.back")}
        className="flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
      </Link>
      <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

      <div className="min-w-0 flex-1 ps-1">
        <p dir="auto" className="truncate text-body-sm font-semibold leading-5">
          {draft.name || t("storefront.studio.storeFallback")}
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-caption leading-4 text-muted-foreground">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              draft.isActive ? "bg-success" : "bg-muted-foreground/50",
            )}
            aria-hidden="true"
          />
          <span className="shrink-0">
            {draft.isActive ? t("storefront.active") : t("storefront.inactive")}
          </span>
          <span className="truncate max-sm:hidden" dir="ltr">
            /storefront/{draft.slug}
          </span>
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("storefront.studio.previewDevice")}
        className="flex shrink-0 rounded-control border bg-muted/40 p-0.5 max-md:hidden"
      >
        {DEVICES.map(({ id, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={device === id}
                aria-label={t(`storefront.studio.device.${id}`)}
                onClick={() => onDevice(id)}
                className={cn(
                  "flex h-7 w-8 items-center justify-center rounded-[calc(var(--radius-control)-2px)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  device === id
                    ? "bg-background text-foreground shadow-(--elevation-1)"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t(`storefront.studio.device.${id}`)}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="flex flex-1 items-center justify-end gap-1.5">
        <div className="flex items-center max-sm:hidden">
          <IconAction label={t("storefront.studio.undo")} shortcut="Ctrl+Z" disabled={!canUndo} onClick={onUndo}>
            <Undo2 />
          </IconAction>
          <IconAction label={t("storefront.studio.redo")} shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={onRedo}>
            <Redo2 />
          </IconAction>
        </div>

        <SaveStatus state={saveState} dirty={dirty} savedAt={savedAt} onRetry={onSave} />

        <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-control border px-2.5 text-caption font-medium max-lg:hidden">
          <Switch
            checked={draft.isActive}
            onCheckedChange={onActiveChange}
            aria-label={t("storefront.studio.visibleToBuyers")}
          />
          <span>{t("storefront.studio.visibleToBuyers")}</span>
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("storefront.list.more")}
              title={t("storefront.list.more")}
              className="flex size-9 shrink-0 items-center justify-center rounded-control border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem asChild>
              <a href={storeHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("storefront.studio.viewStore")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/storefronts/${encodeURIComponent(storefrontId)}/history`}>
                <History className="size-4" aria-hidden="true" />
                {t("storefront.list.releases")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onValidate}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t("storefront.studio.validate")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="lg:hidden"
              onSelect={() => onActiveChange(!draft.isActive)}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  draft.isActive ? "bg-success" : "bg-muted-foreground/50",
                )}
                aria-hidden="true"
              />
              {t("storefront.studio.visibleToBuyers")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          disabled={publishDisabled}
          onClick={onPublish}
          data-studio-publish="true"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control bg-primary px-3.5 text-body-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
        >
          <UploadCloud className="size-4" aria-hidden="true" />
          {t("storefront.studio.publish")}
        </button>
      </div>
    </header>
  );
}

function IconAction({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-keyshortcuts={shortcut?.replace("Ctrl", "Control")}
          disabled={disabled}
          onClick={onClick}
          className="flex size-9 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span dir="ltr" className="ms-2 opacity-70">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Draft durability, in words: autosave state, last save time, or the fault. */
function SaveStatus({
  state,
  dirty,
  savedAt,
  onRetry,
}: {
  state: StudioSaveState;
  dirty: boolean;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const time = savedAt?.toLocaleTimeString(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    ...DZ_CLOCK,
  });
  const failed = state === "error" || state === "conflict";
  const label =
    state === "saving"
      ? t("storefront.studio.saving")
      : state === "conflict"
        ? t("storefront.studio.conflict")
        : state === "error"
          ? t("storefront.studio.saveFailed")
          : dirty
            ? t("storefront.studio.unsaved")
            : time
              ? t("storefront.studio.savedAt", { time })
              : t("storefront.studio.saved");
  const Icon = state === "saving" || (dirty && !failed) ? Loader2 : failed ? AlertCircle : CheckCircle2;

  const content = (
    <>
      <Icon
        className={cn("size-3.5 shrink-0", (state === "saving" || (dirty && !failed)) && "animate-spin")}
        aria-hidden="true"
      />
      <span className="truncate max-sm:sr-only">{label}</span>
    </>
  );

  return state === "error" ? (
    <button
      type="button"
      onClick={onRetry}
      data-studio-save-status={state}
      className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-control px-2 text-caption font-medium text-destructive outline-none hover:bg-destructive-soft focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </button>
  ) : (
    <span
      role="status"
      data-studio-save-status={state}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 px-1 text-caption",
        failed ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      {content}
    </span>
  );
}
