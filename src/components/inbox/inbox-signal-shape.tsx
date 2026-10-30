import type { ChipShape } from "@/components/inbox/inbox-queue-model";
import { cn } from "@/lib/utils";

const TONE: Record<ChipShape, string> = {
  diamond: "text-warning",
  dot: "text-success",
  triangle: "text-destructive",
  ring: "text-muted-foreground",
};

/** Meaning lives in the outline (diamond, dot, triangle, ring); colour only helps. */
export function SignalShape({
  shape,
  className,
}: {
  shape: ChipShape;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 12"
      data-shape={shape}
      className={cn("size-3 shrink-0", TONE[shape], className)}
    >
      {shape === "dot" ? <circle cx="6" cy="6" r="4.5" fill="currentColor" /> : null}
      {shape === "ring" ? (
        <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      ) : null}
      {shape === "diamond" ? (
        <path d="M6 0.8 11.2 6 6 11.2 0.8 6Z" fill="currentColor" />
      ) : null}
      {shape === "triangle" ? <path d="M6 1 11.4 10.6H0.6Z" fill="currentColor" /> : null}
    </svg>
  );
}
