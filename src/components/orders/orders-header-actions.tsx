import type { ReactNode } from "react";

interface OrdersHeaderActionsProps {
  /** Confirmation queue link (only when something is pending). */
  queue?: ReactNode;
  /** Export / import buttons (only when the person may use them). */
  importExport?: ReactNode;
  /** The main action: create an order. */
  primary?: ReactNode;
}

/**
 * The Orders header actions. The DOM keeps its old order (keyboard order on a desktop does not move). On a phone the
 * main action is lifted to the first place with CSS `order`; from md: (768 px) its wrapper has no box
 * (`display: contents`), so the desktop row is exactly what it was.
 */
export function OrdersHeaderActions({ queue, importExport, primary }: OrdersHeaderActionsProps) {
  if (!queue && !importExport && !primary) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {queue}
      {importExport}
      {primary ? <div className="flex max-md:order-first md:contents">{primary}</div> : null}
    </div>
  );
}
