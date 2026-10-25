/**
 * The commune search box of the checkout (STORE-WILAYA69). One text box above the wilaya and commune selects: the buyer
 * types a commune name, picks a row, and the box fills the two selects the page already has. The selects stay visible
 * and editable, and they are the fallback when anything here fails. Nothing here touches the order, its validation or
 * its encryption: it only sets the two selects and fires the same `change` event a buyer's own choice fires.
 *
 * ARIA 1.2 combobox, list autocomplete, focus stays in the input and aria-activedescendant names the highlighted row.
 * The listbox is in the server markup (hidden), so aria-controls always points at an element that exists.
 */
import { searchCommunes, type CommuneIndexRow, type CommuneMatch } from "./communes";

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
  /** The page is Arabic: a row shows the Arabic name when it has one. */
  arabic: boolean;
  /** The fee table the checkout already reads; its keys are the wilayas the shop delivers to. */
  fees: Record<string, unknown>;
  text: { none: string; failed: string; count: string };
  /** The promise of the commune-list load the wilaya `change` handler started last. */
  communesLoaded: () => Promise<void>;
};

function validIndex(json: unknown): json is CommuneIndexRow[] {
  return Array.isArray(json) && json.every((row) => Array.isArray(row) && row.length === 3 && row.every((cell) => typeof cell === "string"));
}

export function setupCommuneSearch(parts: CommuneSearchParts, options: CommuneSearchOptions): void {
  const { box, list, note, count, wilaya, commune } = parts;
  let index: Promise<CommuneIndexRow[] | null> | null = null;
  let failed = false;
  let shown: CommuneMatch[] = [];
  let active = -1;
  // An answer that arrives after a newer keystroke, pick or clear finds an older number here and is dropped.
  let queryNumber = 0;
  let pickNumber = 0;
  let picking = false;

  /** Fetched once. After a failure only the next focus (`again`) tries once more, so typing offline does not fetch on every key. */
  function loadIndex(again = false): Promise<CommuneIndexRow[] | null> {
    if (index && !(again && failed)) return index;
    failed = false;
    const attempt = (async () => {
      try {
        const response = await fetch(options.url);
        if (!response.ok) return null;
        const json: unknown = await response.json();
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
  const nameOf = (row: CommuneMatch): string => (options.arabic && row.arabic ? row.arabic : row.latin);

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

  function close(): void {
    shown = [];
    list.textContent = "";
    list.hidden = true;
    box.setAttribute("aria-expanded", "false");
    setActive(-1);
    count.textContent = "";
  }

  function rowFor(row: CommuneMatch, at: number): HTMLElement {
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
    return item;
  }

  function show(rows: CommuneMatch[]): void {
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
    show(searchCommunes(rows, text, allowed()));
    return shown.length > 0;
  }

  async function pick(row: CommuneMatch): Promise<void> {
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
            if (drawn) setActive(0);
          });
        }
        return;
      }
      event.preventDefault();
      const last = shown.length - 1;
      if (event.key === "ArrowDown") setActive(active >= last ? 0 : active + 1);
      else setActive(active <= 0 ? last : active - 1);
    } else if (event.key === "Enter") {
      // Enter in this box must never send the order form; it only picks the highlighted row
      event.preventDefault();
      if (!list.hidden && active >= 0) void pick(shown[active] as CommuneMatch);
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
    if (item) void pick(shown[Array.prototype.indexOf.call(list.children, item) as number] as CommuneMatch);
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
