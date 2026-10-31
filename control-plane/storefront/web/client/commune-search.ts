/**
 * The commune search box of the checkout (STORE-WILAYA69). One text box above the wilaya and commune selects: the buyer
 * types a commune name, picks a row, and the box fills the two selects the page already has. The selects stay visible
 * and editable, and they are the fallback when anything here fails. Nothing here touches the order, its validation or
 * its encryption: it only sets the two selects and fires the same `change` event a buyer's own choice fires.
 *
 * ARIA 1.2 combobox, list autocomplete, focus stays in the input and aria-activedescendant names the highlighted row.
 * The listbox is in the server markup (hidden), so aria-controls always points at an element that exists.
 */
import { findCommunes, type CommuneHit, type CommuneIndexRow, type Reform } from "./communes";

export type CommuneSearchParts = {
  box: HTMLInputElement;
  list: HTMLElement;
  /** Visible line for "no commune found" and "search is unavailable". */
  note: HTMLElement;
  /** Screen-reader line with the number of results. */
  count: HTMLElement;
  wilaya: HTMLSelectElement;
  commune: HTMLSelectElement;
};

export type CommuneSearchOptions = {
  /** Where the index lives: public/_sf/c.<hash>/all.json. */
  url: string;
  /** Where the old-wilaya and alias data lives: public/_sf/c.<hash>/reform.json. Without it the search has no hint and no alias. */
  reformUrl: string;
  /** The page is Arabic: a row shows the Arabic name when it has one. */
  arabic: boolean;
  /** The fee table the checkout already reads; its keys are the wilayas the shop delivers to. */
  fees: Record<string, unknown>;
  /** formerly / noDelivery carry a {{wilaya}} that is replaced by text (never markup). */
  text: { none: string; failed: string; count: string; formerly: string; noDelivery: string };
  /** The promise of the commune-list load the wilaya `change` handler started last. */
  communesLoaded: () => Promise<void>;
};

function validIndex(json: unknown): json is CommuneIndexRow[] {
  return Array.isArray(json) && json.every((row) => Array.isArray(row) && row.length === 3 && row.every((cell) => typeof cell === "string"));
}

function validReform(json: unknown): json is Reform {
  const r = json as Reform | null;
  return !!r && Array.isArray(r.aliases) && !!r.moved && typeof r.moved === "object";
}

export function setupCommuneSearch(parts: CommuneSearchParts, options: CommuneSearchOptions): void {
  const { box, list, note, count, wilaya, commune } = parts;
  let index: Promise<CommuneIndexRow[] | null> | null = null;
  let failed = false;
  let reform: Reform | null = null;
  let shown: CommuneHit[] = [];
  let active = -1;
  // An answer that arrives after a newer keystroke, pick or clear finds an older number here and is dropped.
  let queryNumber = 0;
  let pickNumber = 0;
  let picking = false;

  /** Fetched once. After a failure only the next focus (`again`) tries once more, so typing offline does not fetch on every key. */
  function loadIndex(again = false): Promise<CommuneIndexRow[] | null> {
    if (index && !(again && failed)) return index;
    failed = false;
    const extra = fetch(options.reformUrl).then((r) => (r.ok ? r.json() : null), () => null).catch(() => null);
    const attempt = (async () => {
      try {
        const response = await fetch(options.url);
        if (!response.ok) return null;
        const json: unknown = await response.json();
        const more: unknown = await extra;
        reform = validReform(more) ? more : null;
        return validIndex(json) ? json : null;
      } catch {
        return null;
      }
    })();
    index = attempt;
    void attempt.then((rows) => {
      if (!rows && index === attempt) failed = true;
    });
    return attempt;
  }

  // "05 · Batna" is how the wilaya select writes its options; the row shows the same name.
  const wilayaName = (code: string): string => {
    const label = Array.from(wilaya.options).filter((option) => option.value === code)[0];
    return label ? (label.textContent || "").replace(/^\s*\d+\s*·\s*/, "").trim() : "";
  };
  const allowed = (): string[] => Array.from(wilaya.options).map((option) => option.value).filter((code) => code !== "" && options.fees[code] !== undefined);
  const nameOf = (row: CommuneHit): string => (options.arabic && row.arabic ? row.arabic : row.latin);

  function setActive(next: number): void {
    active = next;
    Array.from(list.children).forEach((row, at) => {
      row.setAttribute("aria-selected", String(at === next));
      row.classList.toggle("is-active", at === next);
    });
    const current = next >= 0 ? list.children[next] : undefined;
    if (current) {
      box.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView({ block: "nearest" });
    } else {
      box.removeAttribute("aria-activedescendant");
    }
  }

  /** The next row the buyer can pick in that direction (rows the shop does not deliver to are skipped), wrapping round; -1 when there is none. */
  function step(from: number, direction: 1 | -1): number {
    const size = shown.length;
    const base = from < 0 && direction < 0 ? 0 : from;
    for (let turn = 1; turn <= size; turn++) {
      const at = (((base + direction * turn) % size) + size) % size;
      if ((shown[at] as CommuneHit).delivers) return at;
    }
    return -1;
  }

  function close(): void {
    shown = [];
    list.textContent = "";
    list.hidden = true;
    box.setAttribute("aria-expanded", "false");
    setActive(-1);
    count.textContent = "";
  }

  function rowFor(row: CommuneHit, at: number): HTMLElement {
    const item = document.createElement("li");
    item.id = `sf-opt-${at}`;
    item.className = "sf-opt";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.dataset.code = row.wilayaCode;
    item.dataset.latin = row.latin;
    const name = document.createElement("span");
    name.className = "sf-opt-name";
    name.dir = "auto";
    name.textContent = nameOf(row);
    const where = document.createElement("span");
    where.className = "sf-opt-where";
    const code = document.createElement("bdi");
    code.dir = "ltr";
    code.textContent = row.wilayaCode;
    where.append(code, ` ${wilayaName(row.wilayaCode)}`);
    item.append(name, " ", where);
    if (row.former) {
      // "formerly Batna": only for a commune the 2025 reform moved
      const from = document.createElement("span");
      from.className = "sf-opt-from";
      from.textContent = options.text.formerly.replace("{{wilaya}}", options.arabic ? row.former.arabic : row.former.latin);
      item.append(from);
    }
    if (!row.delivers) {
      // shown so the buyer is not left wondering, but it cannot be picked
      item.classList.add("is-off");
      item.setAttribute("aria-disabled", "true");
      const off = document.createElement("span");
      off.className = "sf-opt-off";
      off.textContent = options.text.noDelivery.replace("{{wilaya}}", row.wilayaCode);
      item.append(off);
    }
    return item;
  }

  function show(rows: CommuneHit[]): void {
    shown = rows;
    list.textContent = "";
    rows.forEach((row, at) => list.appendChild(rowFor(row, at)));
    list.hidden = rows.length === 0;
    box.setAttribute("aria-expanded", String(rows.length > 0));
    setActive(-1);
    note.textContent = rows.length === 0 ? options.text.none : "";
    // the same words again do not make the reader speak again
    count.textContent = rows.length === 0 ? "" : options.text.count.replace("{{count}}", String(rows.length));
  }

  /** Runs the search for what is in the box. Resolves true when it drew rows. */
  async function query(): Promise<boolean> {
    const mine = ++queryNumber;
    const text = box.value;
    if (!text.trim()) {
      close();
      note.textContent = "";
      return false;
    }
    const rows = await loadIndex();
    if (mine !== queryNumber) return false;
    if (!rows) {
      close();
      note.textContent = options.text.failed;
      return false;
    }
    show(findCommunes(rows, text, allowed(), 8, reform));
    return shown.length > 0;
  }

  async function pick(row: CommuneHit): Promise<void> {
    if (!row.delivers) return;
    const mine = ++pickNumber;
    queryNumber += 1;
    close();
    note.textContent = "";
    box.value = nameOf(row);
    picking = true;
    try {
      wilaya.value = row.wilayaCode;
      if (wilaya.value !== row.wilayaCode) return;
      // the same event a buyer's own choice fires: the fee, the summary and the commune list load as usual
      wilaya.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      picking = false;
    }
    await options.communesLoaded();
    if (mine !== pickNumber || wilaya.value !== row.wilayaCode) return;
    commune.value = row.latin;
    if (commune.value !== row.latin) return;
    commune.dispatchEvent(new Event("change", { bubbles: true }));
  }

  box.addEventListener("focus", () => {
    void loadIndex(true).then((rows) => {
      if (!rows) note.textContent = options.text.failed;
      else if (!box.value.trim()) note.textContent = "";
    });
  });
  box.addEventListener("input", () => void query());
  box.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (list.hidden) {
        if (event.key === "ArrowDown" && box.value.trim()) {
          event.preventDefault();
          void query().then((drawn) => {
            if (drawn) setActive(step(-1, 1));
          });
        }
        return;
      }
      event.preventDefault();
      setActive(step(active, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter") {
      // Enter in this box must never send the order form; it only picks the highlighted row
      event.preventDefault();
      if (!list.hidden && active >= 0) void pick(shown[active] as CommuneHit);
    } else if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      close();
    }
  });
  // Leaving for another field closes the list. A click inside the list keeps the focus in the box (mousedown below).
  box.addEventListener("blur", (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && !list.contains(next)) close();
  });
  list.addEventListener("mousedown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    const item = (event.target as Element).closest('[role="option"]');
    if (item) void pick(shown[Array.prototype.indexOf.call(list.children, item) as number] as CommuneHit);
  });
  // A wilaya chosen by hand starts over; the pick above fires the same event, so it is told apart by `picking`.
  wilaya.addEventListener("change", () => {
    if (picking) return;
    pickNumber += 1;
    queryNumber += 1;
    box.value = "";
    close();
    note.textContent = "";
  });
}
