"use client";

import { useId, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { contrastRatio } from "@/lib/storefront/storefront-tokens";
import { cn } from "@/lib/utils";

/**
 * The Studio's form vocabulary. Every control is labelled (the e2e evidence
 * and screen readers find fields by label), sized on the app's control
 * height, and built from the shared UI primitives.
 */

export function PanelHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-body font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-caption leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function InspectorGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3.5 border-t pt-4 first:border-t-0 first:pt-0">
      {/* The inspector's heading already names the section visually. */}
      <legend className="sr-only">{title}</legend>
      {children}
    </fieldset>
  );
}

export function TextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  type = "text",
  dir,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  type?: "text" | "url" | "email" | "tel";
  dir?: "ltr" | "auto";
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-body-sm font-medium">
        <span>{label}</span>
        {maxLength && value.length > maxLength * 0.8 ? (
          <span dir="ltr" className="text-caption tabular-nums text-muted-foreground">
            {value.length}/{maxLength}
          </span>
        ) : null}
      </label>
      <Input
        id={id}
        type={type}
        dir={dir}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={type === "tel" ? "tel" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  maxLength,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-body-sm font-medium">
        <span>{label}</span>
        {maxLength && value.length > maxLength * 0.8 ? (
          <span dir="ltr" className="text-caption tabular-nums text-muted-foreground">
            {value.length}/{maxLength}
          </span>
        ) : null}
      </label>
      <Textarea
        id={id}
        dir="auto"
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="resize-y"
      />
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-body-sm font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-caption text-muted-foreground">{description}</span>
        ) : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** A small set of mutually exclusive options as a segmented control. */
export function SegmentedField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <p id={id} className="text-body-sm font-medium">{label}</p>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="grid gap-0.5 rounded-control border bg-muted/40 p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-8 truncate rounded-[calc(var(--radius-control)-2px)] px-2 text-caption font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              value === option.value
                ? "bg-background text-foreground shadow-(--elevation-1)"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-body-sm font-medium">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-(--control-height) w-full rounded-control border border-input bg-background px-3 text-body-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A brand colour: native picker swatch + hex entry. When a `contrastWith`
 * colour is given, a warning appears below 4.5:1 (WCAG AA body text).
 */
export function ColorField({
  label,
  value,
  onChange,
  contrastWith,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  contrastWith?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const lowContrast = contrastWith ? contrastRatio(value, contrastWith) < 4.5 : false;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-body-sm font-medium">{label}</label>
      <div className="flex h-(--control-height) items-center gap-2 rounded-control border border-input bg-background px-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-7 shrink-0 cursor-pointer rounded-[6px] border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[6px] [&::-webkit-color-swatch]:border-0"
        />
        {/* Uncontrolled while typing (a partial "#1a" is allowed); a valid
            hex commits, and an outside change remounts it via the key. */}
        <input
          key={value}
          id={id}
          dir="ltr"
          defaultValue={value}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toUpperCase());
          }}
          className="min-w-0 flex-1 bg-transparent font-mono text-body-sm uppercase outline-none"
        />
      </div>
      {lowContrast ? (
        <p className="flex items-start gap-1.5 text-caption text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {t("storefront.studio.contrastWarning")}
        </p>
      ) : null}
    </div>
  );
}
