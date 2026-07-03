"use client";

import * as React from "react";
import { Controller, type FieldPath, type FieldValues, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InfoHint } from "@/components/shared/info-hint";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

// ── Validation status ──
type ValidationStatus = "idle" | "checking" | "valid" | "invalid";

const STATUS_ICON: Record<ValidationStatus, React.ReactNode> = {
  idle: null,
  checking: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
  valid: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  invalid: <AlertCircle className="h-4 w-4 text-destructive" />,
};

// ── FormField wrapper ──
interface FormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  name: TName;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: (field: {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
    ref: React.RefCallback<HTMLElement>;
    invalid: boolean;
  }) => React.ReactNode;
}

export function FormField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  name,
  label,
  hint,
  required,
  className,
  children,
}: FormFieldProps<TFieldValues, TName>) {
  const { control, formState: { errors } } = useFormContext<TFieldValues>();
  const error = errors[name]?.message as string | undefined;
  const invalid = !!error;

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || hint) && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={name} className="text-sm font-medium">
            {label}
            {required && <span className="text-destructive ms-0.5">*</span>}
          </Label>
          {hint && <InfoHint content={hint} size="sm" />}
        </div>
      )}
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <>
            {children({
              value: field.value,
              onChange: field.onChange,
              onBlur: field.onBlur,
              ref: field.ref as React.RefCallback<HTMLElement>,
              invalid,
            })}
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
          </>
        )}
      />
    </div>
  );
}

// ── FormInput — input with inline validation status ──
interface FormInputProps extends Omit<React.ComponentProps<typeof Input>, "name"> {
  name: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  /** Async validation status (for debounced server checks). */
  asyncStatus?: ValidationStatus;
}

export function FormInput({
  name,
  label,
  hint,
  required,
  asyncStatus = "idle",
  className,
  ...props
}: FormInputProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string | undefined;

  return (
    <div className="space-y-1.5">
      {(label || hint) && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={name} className="text-sm font-medium">
            {label}
            {required && <span className="text-destructive ms-0.5">*</span>}
          </Label>
          {hint && <InfoHint content={hint} size="sm" />}
        </div>
      )}
      <div className="relative">
        <Input
          id={name}
          className={cn(
            error && "border-destructive focus-visible:ring-destructive",
            asyncStatus === "valid" && "border-emerald-500",
            asyncStatus === "checking" && "pr-9",
            asyncStatus === "valid" && "pr-9",
            asyncStatus === "invalid" && "pr-9",
            className,
          )}
          {...register(name)}
          {...props}
        />
        {asyncStatus !== "idle" && (
          <div className="absolute end-2.5 top-1/2 -translate-y-1/2">
            {STATUS_ICON[asyncStatus]}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ── FormTextarea ──
interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  name: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
}

export function FormTextarea({ name, label, hint, required, className, ...props }: FormTextareaProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string | undefined;

  return (
    <div className="space-y-1.5">
      {(label || hint) && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={name} className="text-sm font-medium">
            {label}
            {required && <span className="text-destructive ms-0.5">*</span>}
          </Label>
          {hint && <InfoHint content={hint} size="sm" />}
        </div>
      )}
      <Textarea
        id={name}
        className={cn(error && "border-destructive focus-visible:ring-destructive", className)}
        {...register(name)}
        {...props}
      />
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}
