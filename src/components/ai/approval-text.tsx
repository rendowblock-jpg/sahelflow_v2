"use client";

import { useState } from "react";

import { describeApprovalText } from "@/components/ai/approval-display-text";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * One value from a proposal, as plain text. React escapes it; hidden
 * characters are written out; a long value is cut with the number of
 * characters left out, and the whole value stays one tap away.
 */
export function ApprovalText({ value, t }: { value: string; t: Translate }) {
  const [open, setOpen] = useState(false);
  const view = describeApprovalText(value);
  return (
    <>
      <span dir="auto" className="whitespace-pre-wrap break-words" data-ai-approval-text>
        <bdi>{open ? view.full : view.shown}</bdi>
        {view.cut > 0 && !open ? (
          <span data-ai-approval-cut className="text-muted-foreground">
            {" "}
            … {t("ai.approvalTool.cut", { count: view.cut })}
          </span>
        ) : null}
      </span>
      {view.cut > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          data-ai-approval-expand
          onClick={() => setOpen((current) => !current)}
          className="ms-2 inline-flex min-h-7 items-center rounded-control text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? t("ai.approvalTool.showLess") : t("ai.approvalTool.showAll")}
        </button>
      ) : null}
    </>
  );
}
