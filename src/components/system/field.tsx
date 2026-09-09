import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The form-field grammar.
 *
 * The accessibility wiring — `for`/`id`, `aria-describedby` spanning both help
 * and error text, `aria-invalid`, `aria-required` — is the part that is easy to
 * get subtly wrong once per form. Field owns it in one place and hands the
 * resolved attributes to the control, so a field cannot ship half-wired.
 *
 * INTERFACE_SYSTEM.md §6, §12.
 */

export interface FieldControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
  "aria-required": boolean | undefined;
}

interface FieldProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** Stable id root. The control receives `id`, descriptions derive from it. */
  id: string;
  label: React.ReactNode;
  /** Supporting guidance shown under the control. */
  help?: React.ReactNode;
  /** Validation message. Presence marks the field invalid. */
  error?: React.ReactNode;
  required?: boolean;
  /**
   * The control. Given a function, Field passes the resolved accessibility
   * attributes so the control is wired correctly without the caller repeating
   * the id arithmetic.
   */
  children: React.ReactNode | ((props: FieldControlProps) => React.ReactNode);
}

export function Field({
  id,
  label,
  help,
  error,
  required = false,
  className,
  children,
  ...props
}: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [helpId, errorId].filter(Boolean).join(" ") || undefined;

  const controlProps: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
  };

  return (
    <div
      data-slot="field"
      data-invalid={error ? "true" : undefined}
      className={cn("min-w-0 space-y-1.5", className)}
      {...props}
    >
      <label
        htmlFor={id}
        className="block text-body-sm font-medium text-foreground"
      >
        {label}
        {required ? (
          <span className="ms-1 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {typeof children === "function" ? children(controlProps) : children}

      {help ? (
        <p id={helpId} className="text-caption text-muted-foreground">
          {help}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-caption font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
