import { useEffect } from "react";

/** id of the error text; every failed field points at it with aria-describedby. */
export const FORM_ERROR_ID = "form-error";

export type FormFailure = Readonly<{
  /** DOM id of the first field that must be fixed. */
  field: string;
  message: string;
  title?: string;
  /** The one next step, shown under the message. */
  hint?: string;
}>;

export function describedByFor(failure: FormFailure | null, fieldId: string, helpId?: string): string | undefined {
  const ids = [failure?.field === fieldId ? FORM_ERROR_ID : undefined, helpId].filter(
    (id): id is string => typeof id === "string",
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function isInvalid(failure: FormFailure | null, fieldId: string): true | undefined {
  return failure?.field === fieldId ? true : undefined;
}

/**
 * Fields are disabled while a request runs, which closes the phone keyboard. Once the request is over, put the
 * cursor back on the field that failed. A new failure object (even with the same text) focuses again.
 */
export function useFocusOnFailure(failure: FormFailure | null, busy: boolean): void {
  useEffect(() => {
    if (!failure || busy) return;
    const el = document.getElementById(failure.field);
    if (el instanceof HTMLInputElement && !el.disabled) el.focus();
  }, [failure, busy]);
}
