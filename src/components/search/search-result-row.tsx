"use client";

import * as React from "react";
import { CornerDownLeft } from "lucide-react";

import { TechnicalValue } from "@/components/i18n/technical-value";
import { IconTile, type IconTileTone } from "@/components/system";
import { CommandItem } from "@/components/ui/command";
import { searchHighlightRanges } from "@/lib/search/search-highlight";
import type { UniversalSearchCandidate, UniversalSearchKind } from "@/lib/search/universal-search";
import { cn } from "@/lib/utils";

export type SearchRow = UniversalSearchCandidate & {
  icon: React.ComponentType<{ className?: string }>;
};

/** Semantic tone per result family so a scan by colour is possible. */
const KIND_TONE: Record<UniversalSearchKind, IconTileTone> = {
  order: "primary",
  customer: "info",
  product: "warning",
  conversation: "success",
  delivery: "info",
  return: "warning",
  navigation: "neutral",
  action: "primary",
};

/** Order/delivery/return labels are identifiers: always LTR-isolated. */
export function hasTechnicalLabel(kind: UniversalSearchKind): boolean {
  return kind === "order" || kind === "delivery" || kind === "return";
}

/** Customer/product sublabels are phones/SKUs; conversations only when numeric. */
export function hasTechnicalSublabel(
  kind: UniversalSearchKind,
  value: string,
): boolean {
  if (kind === "customer" || kind === "product") return true;
  if (kind !== "conversation") return false;
  return /^[0-9\s()+\-./]+$/u.test(value);
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const ranges = searchHighlightRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className="rounded-control bg-primary-soft text-foreground"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

interface SearchResultRowProps {
  row: SearchRow;
  query: string;
  kindLabel: string;
  openLabel: string;
  /** Show the family label visibly — only where one group mixes families
   *  (Recent). Otherwise it is still present for assistive technology. */
  showKind?: boolean;
  dimmed?: boolean;
  onSelect: (row: SearchRow) => void;
}

export function SearchResultRow({
  row,
  query,
  kindLabel,
  openLabel,
  showKind = false,
  dimmed = false,
  onSelect,
}: SearchResultRowProps) {
  const labelNode = <Highlighted text={row.label} query={query} />;
  const sublabelNode = row.sublabel ? (
    <Highlighted text={row.sublabel} query={query} />
  ) : null;

  return (
    <CommandItem
      value={`${row.kind}:${row.id}:${row.label}`}
      onSelect={() => onSelect(row)}
      className={cn(
        "group gap-3 rounded-control px-2.5 py-2 transition-opacity duration-150 motion-reduce:transition-none",
        "data-[selected=true]:bg-accent",
        dimmed && "opacity-60",
      )}
    >
      <IconTile icon={row.icon} tone={KIND_TONE[row.kind]} size="sm" />
      <span className="min-w-0 flex-1">
        {hasTechnicalLabel(row.kind) ? (
          <TechnicalValue className="block truncate text-start text-body-sm font-medium text-foreground">
            {labelNode}
          </TechnicalValue>
        ) : (
          <bdi
            dir="auto"
            data-sf-seller-label="true"
            className="block truncate text-body-sm font-medium text-foreground"
          >
            {labelNode}
          </bdi>
        )}
        {row.sublabel ? (
          hasTechnicalSublabel(row.kind, row.sublabel) ? (
            <TechnicalValue className="block truncate text-start text-caption text-muted-foreground">
              {sublabelNode}
            </TechnicalValue>
          ) : (
            <bdi
              dir="auto"
              data-sf-seller-label="true"
              className="block truncate text-caption text-muted-foreground"
            >
              {sublabelNode}
            </bdi>
          )
        ) : null}
      </span>
      {showKind ? (
        <span className="shrink-0 text-caption text-muted-foreground group-data-[selected=true]:hidden">
          {kindLabel}
        </span>
      ) : (
        // Inside a family group the heading carries the kind visually, but an
        // option is announced on its own, without its group heading: every row
        // still names what it is for assistive technology.
        <span className="sr-only">{kindLabel}</span>
      )}
      <span
        className="hidden shrink-0 items-center gap-1 text-caption text-muted-foreground group-data-[selected=true]:inline-flex"
        aria-hidden="true"
      >
        {openLabel}
        <CornerDownLeft className="size-3.5" />
      </span>
    </CommandItem>
  );
}
