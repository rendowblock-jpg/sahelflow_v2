// What makes a reload unsafe (W4SEC-07). A reload throws the page away, so it must not happen while the seller has something the page
// alone holds. Three of the four flags are measured here; the fourth (pairing in progress) is known by the app and passed in by app.ts.
import type { Db } from "../storage/idb";

/** Text fields a seller types words into. A PIN box (type=password) is not here on purpose: an empty or half PIN costs nothing. */
const TEXT_FIELDS = 'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input:not([type])';
/** An open confirm sheet (kit/confirm-sheet.ts) is a modal dialog: the seller is in the middle of a decision. */
const OPEN_SHEET = '.sheet[role="dialog"]';

export type QueryRoot = Readonly<{ querySelectorAll(selector: string): ArrayLike<unknown> }>;

/** true = a reply or note with text in it is open, or a confirm sheet is open. Mere focus and empty (or blank) fields do not count. */
export function isComposing(root: QueryRoot): boolean {
  for (const field of Array.from(root.querySelectorAll(TEXT_FIELDS))) {
    const value = (field as { value?: unknown }).value;
    if (typeof value === "string" && value.trim() !== "") return true;
  }
  return root.querySelectorAll(OPEN_SHEET).length > 0;
}

/**
 * true = at least one command is still "queued": the relay has not accepted it yet, so the phone is the only place it exists.
 * Records are in IndexedDB and a reload does not delete them, but they are re-sent from the page, so the update waits for them.
 * If the store can not be read we do not know, so we say unsafe.
 */
export async function hasUnsentOutbox(db: Pick<Db, "keys" | "get">): Promise<boolean> {
  try {
    for (const key of await db.keys("outbox")) {
      const record = await db.get<{ state?: unknown }>("outbox", key);
      if (record?.state === "queued") return true;
    }
    return false;
  } catch { return true; }
}

export type Inflight = Readonly<{ track(f: typeof fetch): typeof fetch; count(): number }>;

/** Counts requests that were started and have not settled yet (answer or failure), so a reload does not cut one in half. */
export function createInflight(): Inflight {
  let open = 0;
  return {
    count: () => open,
    track(f) {
      return ((...args: Parameters<typeof fetch>): Promise<Response> => {
        open += 1;
        let pending: Promise<Response>;
        try { pending = Promise.resolve(f(...args)); } catch (error) { open -= 1; throw error; }
        return pending.then((response) => { open -= 1; return response; }, (error: unknown) => { open -= 1; throw error; });
      }) as typeof fetch;
    },
  };
}
