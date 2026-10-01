"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { aiAttachmentSrc } from "@/components/ai/ai-image-input";
import type { AiAttachmentView, AiCopyFn } from "@/components/ai/ai-workspace-types";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The images a seller sent with a turn: a compact grid at the end of the
 * turn (one image shows larger), each opening full size in a viewer.
 */
export function AiMessageImages({
  attachments,
  copy,
}: {
  attachments: AiAttachmentView[];
  copy: AiCopyFn;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const single = attachments.length === 1;
  const open = openIndex !== null ? attachments[openIndex] : null;

  return (
    <>
      <ul
        data-ai-message-images="true"
        className={cn("mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5")}
      >
        {attachments.map((attachment, index) => (
          <li key={attachment.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`${copy("imageOpen")} — ${copy("imageAlt", { index: index + 1 })}`}
              className={cn(
                "block overflow-hidden rounded-surface border border-border bg-muted outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
                single ? "max-h-72 max-w-72" : "size-28",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image */}
              <img
                src={aiAttachmentSrc(attachment)}
                alt={copy("imageAlt", { index: index + 1 })}
                loading="lazy"
                width={attachment.width ?? undefined}
                height={attachment.height ?? undefined}
                className={cn(
                  "block",
                  single ? "h-auto max-h-72 w-auto max-w-72 object-contain" : "size-full object-cover",
                )}
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpenIndex(null)}>
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-auto max-w-[min(90vw,64rem)] overflow-visible border-0 bg-transparent p-0 shadow-none sm:max-w-[min(90vw,64rem)] sm:p-0"
        >
          <DialogClose
            aria-label={copy("close")}
            className="absolute -top-11 end-0 flex size-9 items-center justify-center rounded-full bg-background/85 text-foreground shadow-(--elevation-2) outline-none transition hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogClose>
          <DialogTitle className="sr-only">
            {open ? copy("imageAlt", { index: (openIndex ?? 0) + 1 }) : ""}
          </DialogTitle>
          {open ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image
            <img
              src={aiAttachmentSrc(open)}
              alt={copy("imageAlt", { index: (openIndex ?? 0) + 1 })}
              className="max-h-[85vh] max-w-full rounded-surface object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
