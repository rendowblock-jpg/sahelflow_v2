"use client";

import * as React from "react";

import { SahelFlowMark } from "@/components/brand/sahelflow-mark";
import { IconTile } from "@/components/system/icon-tile";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The entry-surface grammar: setup, sign-in, joining a team and licence
 * activation. One brand rail (identity, promise, three proof points) beside
 * one focused task column. Below the large breakpoint the rail folds into a
 * compact identity row so the task stays first.
 *
 * INTERFACE_SYSTEM.md §6. Copy arrives as props; the language names in the
 * switcher are endonyms, not translatable copy.
 */

export interface EntryPoint {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

interface EntryShellProps {
  /** The task heading — the page's single visible <h1>. */
  title: string;
  description?: string;
  /** Brand rail headline and proof points. */
  headline: string;
  lede: string;
  points: readonly EntryPoint[];
  /** Reassurance line at the foot of the brand rail. */
  assurance: string;
  languageLabel: string;
  /** Rendered before the task column content (e.g. the runtime beacon). */
  beforeContent?: React.ReactNode;
  /** Task column width: forms use `sm`, choice surfaces such as licensing `md`. */
  width?: "sm" | "md";
  children: React.ReactNode;
  className?: string;
}

const LANGUAGES: ReadonlyArray<{ locale: Locale; label: string }> = [
  { locale: "ar", label: "العربية" },
  { locale: "fr", label: "Français" },
  { locale: "en", label: "English" },
];

function EntryLanguageSwitch({ label }: { label: string }) {
  const { locale, setLocale, isLocalePending } = useI18n();
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-control border bg-surface-1 p-1"
    >
      {LANGUAGES.map((option) => {
        const active = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            lang={option.locale}
            aria-pressed={active}
            disabled={isLocalePending}
            onClick={() => setLocale(option.locale)}
            className={cn(
              "rounded-control px-2.5 py-1 text-caption outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function BrandIdentity({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <SahelFlowMark className="size-8" priority />
      <span className="text-title-3 text-foreground" dir="ltr">
        SahelFlow
      </span>
    </div>
  );
}

export function EntryShell({
  title,
  description,
  headline,
  lede,
  points,
  assurance,
  languageLabel,
  beforeContent,
  width = "sm",
  children,
  className,
}: EntryShellProps) {
  return (
    <main
      data-sf-entry=""
      className={cn("grid min-h-dvh bg-surface-0 lg:grid-cols-12", className)}
    >
      {beforeContent}
      <aside className="hidden flex-col justify-between gap-10 border-e bg-surface-1 p-10 lg:sticky lg:top-0 lg:col-span-5 lg:flex lg:h-dvh xl:p-12">
        <BrandIdentity />
        <div className="max-w-md space-y-8" data-sf-entry-reveal="">
          <div className="space-y-3">
            <p className="text-display text-foreground">{headline}</p>
            <p className="text-body text-muted-foreground">{lede}</p>
          </div>
          <ul className="space-y-5">
            {points.map((point) => (
              <li key={point.title} className="flex items-start gap-3.5">
                <IconTile icon={point.icon} tone="primary" size="md" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-title-3 text-foreground">{point.title}</p>
                  <p className="text-body-sm text-muted-foreground">{point.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-md text-caption text-muted-foreground">{assurance}</p>
      </aside>

      <section className="flex min-w-0 flex-col lg:col-span-7">
        <header className="flex items-center justify-between gap-4 p-5">
          <BrandIdentity className="lg:invisible" />
          <EntryLanguageSwitch label={languageLabel} />
        </header>
        <div className="flex flex-1 items-center justify-center px-5 pb-10">
          <div
            className={cn("w-full space-y-7", width === "md" ? "max-w-md" : "max-w-sm")}
            data-sf-entry-reveal=""
          >
            <div className="space-y-2">
              <h1 className="text-title-1 text-foreground">{title}</h1>
              {description ? (
                <p className="text-body text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
