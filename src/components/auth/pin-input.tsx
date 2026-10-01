"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type PinInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

/** Numeric secret entry with a reveal toggle; used by every entry surface. */
export function PinInput({ className, disabled, ...props }: PinInputProps) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={revealed ? "text" : "password"}
        inputMode="numeric"
        dir="ltr"
        disabled={disabled}
        className={cn("h-11 px-11 text-center text-title-2 tracking-widest", className)}
      />
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        disabled={disabled}
        aria-label={revealed ? t("auth.hidePin") : t("auth.showPin")}
        aria-pressed={revealed}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
