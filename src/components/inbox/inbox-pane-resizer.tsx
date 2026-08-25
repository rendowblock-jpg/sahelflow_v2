"use client";

import { useRef, type RefObject } from "react";

import {
  INBOX_QUEUE_DEFAULT_WIDTH,
  inboxQueueWidthFromKey,
  inboxQueueWidthFromPointer,
  type InboxDirection,
} from "@/components/inbox/inbox-pane-width";
import { cn } from "@/lib/utils";

function pageDirection(): InboxDirection {
  return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
}

export function InboxPaneResizer({
  containerRef,
  width,
  min,
  max,
  label,
  onResize,
  onCommit,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  width: number;
  min: number;
  max: number;
  label: string;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
}) {
  const activePointerRef = useRef<number | null>(null);
  const liveWidthRef = useRef(width);
  liveWidthRef.current = width;

  const pointerWidth = (clientX: number): number | null => {
    const container = containerRef.current;
    if (!container) return null;
    const bounds = container.getBoundingClientRect();
    return inboxQueueWidthFromPointer(
      clientX,
      bounds.left,
      bounds.right,
      pageDirection(),
    );
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-controls="inbox-conversation-queue inbox-thread-pane"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width}px`}
      tabIndex={0}
      title={label}
      data-inbox-pane-resizer="true"
      className={cn(
        "group relative hidden w-2 shrink-0 touch-none select-none items-stretch justify-center bg-transparent outline-none md:flex",
        "cursor-col-resize focus-visible:bg-primary/10",
      )}
      onDoubleClick={() => onCommit(INBOX_QUEUE_DEFAULT_WIDTH)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        activePointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        const next = pointerWidth(event.clientX);
        if (next !== null) {
          liveWidthRef.current = next;
          onResize(next);
        }
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (activePointerRef.current !== event.pointerId) return;
        const next = pointerWidth(event.clientX);
        if (next !== null) {
          liveWidthRef.current = next;
          onResize(next);
        }
      }}
      onPointerUp={(event) => {
        if (activePointerRef.current !== event.pointerId) return;
        const next = pointerWidth(event.clientX);
        activePointerRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onCommit(next ?? liveWidthRef.current);
      }}
      onPointerCancel={(event) => {
        if (activePointerRef.current !== event.pointerId) return;
        activePointerRef.current = null;
        onCommit(liveWidthRef.current);
      }}
      onKeyDown={(event) => {
        if (
          event.key !== "ArrowLeft" &&
          event.key !== "ArrowRight" &&
          event.key !== "Home" &&
          event.key !== "End"
        ) {
          return;
        }
        const containerWidth = containerRef.current?.clientWidth;
        if (!containerWidth) return;
        event.preventDefault();
        onCommit(
          inboxQueueWidthFromKey(
            width,
            event.key,
            pageDirection(),
            containerWidth,
          ),
        );
      }}
    >
      <span
        aria-hidden="true"
        className="w-px bg-border/70 transition-colors group-hover:bg-primary/65 group-focus-visible:bg-primary"
      />
    </div>
  );
}
