"use client";

/**
 * CannedResponsePicker — Popover that lets the inbox composer browse / search
 * saved replies (CannedResponse rows) and insert one into the reply input.
 *
 * Closes the C-audit S3-2 gap: the /api/canned-responses/search endpoint was
 * fully built but had ZERO UI consumers.
 *
 * Self-contained — takes an `onSelect(text: string)` callback. The parent
 * composer decides how to merge the text (append, replace, etc.).
 *
 * State pattern: the parent CannedResponsePicker holds only the `open` state.
 * The search UI lives in CannedResponsePickerBody, which radix mounts fresh
 * inside PopoverContent each time the popover opens (PopoverContent unmounts
 * on close). This avoids setState-in-effect cascading renders.
 */
import { useEffect, useRef, useState } from "react";
import { Bookmark, Loader2, Search } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CannedResponse {
  id: string;
  shortCode: string;
  content: string;
  description?: string | null;
}

interface CannedResponsePickerProps {
  /** Called with the chosen template's body text. */
  onSelect: (text: string) => void;
  /** Disable the trigger (e.g. while the composer is sending). */
  disabled?: boolean;
  /** Visual variant of the trigger button. */
  size?: "default" | "sm" | "icon";
  variant?: "ghost" | "outline" | "default";
}

export function CannedResponsePicker({
  onSelect,
  disabled,
  size = "icon",
  variant = "ghost",
}: CannedResponsePickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={disabled}
          aria-label={t("inbox.cannedResponses.open")}
          title={t("inbox.cannedResponses.open")}
        >
          <Bookmark className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80 p-0">
        {/* Radix unmounts PopoverContent on close, so the body mounts fresh each
            open → useState initializers re-run, no useEffect reset needed. */}
        <CannedResponsePickerBody onSelect={onSelect} onPick={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

interface CannedResponsePickerBodyProps {
  onSelect: (text: string) => void;
  onPick: () => void; // closes the popover
}

function CannedResponsePickerBody({ onSelect, onPick }: CannedResponsePickerBodyProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced search — fires after 250ms of quiet. This is an effect that
  // synchronizes with an external system (the fetch API); the setState calls
  // happen inside an async timeout callback, not synchronously in the body.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const url = `/api/canned-responses/search?q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as { responses?: CannedResponse[] };
        setResults(data.responses ?? []);
      } catch {
        setError(true);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Focus the search input on mount (synchronizing with the DOM).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handlePick = (item: CannedResponse) => {
    onSelect(item.content);
    onPick();
  };

  return (
    <>
      <div className="border-b p-2">
        <div className="flex items-center gap-2 rounded-md px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("inbox.cannedResponses.search")}
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
            aria-label={t("inbox.cannedResponses.search")}
          />
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          )}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {error ? (
          <p className="p-3 text-xs text-destructive">{t("common.error")}</p>
        ) : !loading && results.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {query.trim()
              ? t("inbox.cannedResponses.noResults")
              : t("inbox.cannedResponses.empty")}
          </p>
        ) : (
          <ul className="divide-y">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handlePick(item)}
                  className={cn(
                    "w-full text-start px-3 py-2 hover:bg-accent transition-colors",
                    "focus:bg-accent focus:outline-none",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {item.shortCode}
                    </span>
                    {item.description && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {item.description}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {item.content}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
