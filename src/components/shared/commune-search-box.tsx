"use client";

/**
 * Type-to-find commune search for the local order form (STORE-WILAYA69, slice 2). The buyer says "Berika"; the seller types
 * it here, picks the row and the wilaya AND commune are set (the form derives the delivery fee and zone from them as it
 * always did). The two Radix selects stay under it as the fallback. The matcher is the one the hosted checkout uses
 * (control-plane/storefront/web/client/communes.ts), so both places agree on spellings, old names and aliases.
 * ARIA 1.2 combobox: focus stays in the input, aria-activedescendant names the highlighted row. Arrow/Enter/Esc work, RTL follows dir=auto.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { createStorefrontTranslator } from "@/lib/i18n/storefront-locale";
import { buildReform } from "../../../control-plane/storefront/web/client/commune-reform";
import {
  findCommunes,
  type CommuneHit,
  type CommuneIndexRow,
} from "../../../control-plane/storefront/web/client/communes";
import wilayasData from "../../../data/wilayas.json";

// old-wilaya names and the spellings buyers type, built from the repo's own data (no network, nothing extra to ship)
const REFORM = buildReform(wilayasData);

type ApiCommune = { name: string; nameAr?: string; wilayaCode: number };

const ALL_WILAYAS = Array.from({ length: 69 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

let indexPromise: Promise<CommuneIndexRow[] | null> | null = null;

/** Fetched once, on the first focus (the 197 KB list stays out of the page bundle). A failure is forgotten so the next focus tries again. */
function loadIndex(): Promise<CommuneIndexRow[] | null> {
  indexPromise ??= fetch("/api/communes")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { communes?: ApiCommune[] } | null) =>
      Array.isArray(data?.communes)
        ? data.communes.map(
            (c): CommuneIndexRow => [
              c.name,
              c.nameAr ?? "",
              String(c.wilayaCode).padStart(2, "0"),
            ],
          )
        : null,
    )
    .catch(() => null)
    .then((rows) => {
      if (!rows) indexPromise = null;
      return rows;
    });
  return indexPromise;
}

/** For tests: forget the fetched list. */
export function resetCommuneIndexForTests(): void {
  indexPromise = null;
}

export function CommuneSearchBox({
  locale,
  disabled,
  wilayaName,
  onPick,
}: {
  locale: Locale;
  disabled?: boolean;
  /** The Latin wilaya name for a two-digit code (what the form stores). */
  wilayaName: (code: string) => string;
  onPick: (wilaya: string, commune: string) => void;
}) {
  const t = createStorefrontTranslator(locale);
  const id = useId();
  const [text, setText] = useState("");
  const [hits, setHits] = useState<CommuneHit[]>([]);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const [searched, setSearched] = useState(false);
  const latest = useRef(0);
  const openRef = useRef(false);
  const ar = locale === "ar";
  const name = (hit: CommuneHit) => (ar && hit.arabic ? hit.arabic : hit.latin);

  async function search(value: string) {
    const mine = ++latest.current;
    setText(value);
    setActive(-1);
    if (!value.trim()) {
      setHits([]);
      setSearched(false);
      return;
    }
    const rows = await loadIndex();
    // an answer for older text than what is in the box now (or after a pick) is dropped
    if (mine !== latest.current) return;
    if (!rows) {
      setFailed(true);
      setHits([]);
      return;
    }
    setFailed(false);
    setHits(findCommunes(rows, value, ALL_WILAYAS, 8, REFORM));
    setSearched(true);
  }

  function pick(hit: CommuneHit) {
    latest.current += 1;
    onPick(wilayaName(hit.wilayaCode), hit.latin);
    setText(name(hit));
    setHits([]);
    setSearched(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (hits.length === 0) return;
      event.preventDefault();
      const last = hits.length - 1;
      setActive(
        event.key === "ArrowDown"
          ? active >= last
            ? 0
            : active + 1
          : active <= 0
            ? last
            : active - 1,
      );
    } else if (event.key === "Enter") {
      // Enter here must never submit the order form; it only picks the highlighted row
      event.preventDefault();
      const hit = hits[active];
      if (hit) pick(hit);
    } else if (event.key === "Escape" && hits.length > 0) {
      event.preventDefault();
      setHits([]);
      setActive(-1);
    }
  }

  const open = hits.length > 0;
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    // A dialog around the form closes on Escape through a capture listener on the document. This one is added first (a child's
    // effect runs before its parent's), so while the list is open Escape closes the list only; the next Escape reaches the dialog.
    const guard = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !openRef.current) return;
      if ((event.target as HTMLElement | null)?.id !== `${id}-box`) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      setHits([]);
      setActive(-1);
    };
    document.addEventListener("keydown", guard, true);
    return () => document.removeEventListener("keydown", guard, true);
  }, [id]);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor={`${id}-box`}>
        {t("storefront.shop.communeSearch")}
      </Label>
      <Input
        id={`${id}-box`}
        type="text"
        dir="auto"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        placeholder={t("storefront.shop.communePlaceholder")}
        value={text}
        onFocus={() => void loadIndex()}
        onChange={(event) => void search(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        hidden={!open}
        className="max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground"
      >
        {hits.map((hit, at) => (
          <li
            key={`${hit.latin}-${hit.wilayaCode}`}
            id={`${id}-opt-${at}`}
            role="option"
            aria-selected={at === active}
            className={`flex min-h-10 cursor-pointer flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-sm ${at === active ? "bg-accent" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(hit)}
          >
            <span dir="auto" className="font-medium">
              {name(hit)}
            </span>
            <span className="text-xs text-muted-foreground">
              <bdi dir="ltr">{hit.wilayaCode}</bdi> {wilayaName(hit.wilayaCode)}
              {hit.former
                ? ` · ${t("storefront.shop.communeFormerly", { wilaya: ar ? hit.former.arabic : hit.former.latin })}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      <p role="status" className="text-xs font-medium">
        {failed
          ? t("storefront.shop.communeFailed")
          : searched && !open
            ? t("storefront.shop.communeNone")
            : ""}
      </p>
    </div>
  );
}
