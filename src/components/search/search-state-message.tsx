import type * as React from "react";

import { IconTile } from "@/components/system";

interface SearchStateMessageProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  tone?: "neutral" | "warning";
}

/** Empty / unavailable / degraded answer inside the command center list. */
export function SearchStateMessage({
  icon,
  title,
  hint,
  tone = "neutral",
}: SearchStateMessageProps) {
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 py-8 text-center"
      role="status"
    >
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="space-y-1">
        <p className="text-body-sm font-medium text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-caption text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}
