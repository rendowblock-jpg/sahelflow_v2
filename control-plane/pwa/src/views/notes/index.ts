// W3-F4 step 3: the notes composer, shared with the inbox screens (F5). One draft per target, kept on the phone until it is sent.
import { STALE_MS } from "../../../../../src/lib/connected-platform/contracts";
import { t, type Locale } from "../../i18n";
import { renderChip } from "../../kit/command-chip";
import type { EnqueueInput, EnqueueResult } from "../../outbox/outbox";
import type { OutboxRecord } from "../../outbox/state";
import type { Db } from "../../storage/idb";
import { esc } from "../view";

export const NOTE_MAX = 4000;
export type NoteEntity = "order" | "conversation";
export type NotesError = "send" | "busy" | "empty" | "long";
export type NotesCtx = Readonly<{
  entityType: NoteEntity; entityId: string; noteVersion: number;
  // The outbox rows of this phone for this target (any state); other kinds are ignored.
  notes: readonly OutboxRecord[]; draft: string; locale: Locale; now: number; online: boolean;
  error?: NotesError | null; readOnly?: boolean; authorityExpiresAt?: number; timeZone?: string;
}>;

export function renderNotes(c: Readonly<NotesCtx>): string {
  const L = c.locale; const id = esc(c.entityId);
  const mine = c.notes.filter((r) => r.kind === "command.comments.write").sort((a, b) => a.createdAt - b.createdAt);
  const items = mine.map((r) => `<li class="note-item"><p class="note-text" dir="auto">${esc(r.draftText)}</p>${renderChip({ record: r, locale: L, now: c.now, ...(c.authorityExpiresAt === undefined ? {} : { authorityExpiresAt: c.authorityExpiresAt }), ...(c.timeZone ? { timeZone: c.timeZone } : {}) })}</li>`).join("");
  const list = mine.length === 0 ? `<p class="hint">${esc(t(L, "notes.empty"))}</p>` : `<ul class="note-list" aria-label="${esc(t(L, "notes.mine"))}">${items}</ul>`;
  const saved = !c.online && mine.some((r) => r.state === "queued") ? `<p class="hint" role="status">${esc(t(L, "notes.offline"))}</p>` : "";
  const err = c.error ? `<p class="note alert" role="alert">${esc(t(L, `notes.error.${c.error}`, { max: NOTE_MAX }))}</p>` : "";
  const form = c.readOnly ? "" : `<form class="composer" data-form="composer" data-mode="note" data-id="${id}"><label for="note-${id}">${esc(t(L, "cmd.composer.note"))}</label><textarea id="note-${id}" name="text" rows="3" maxlength="${NOTE_MAX}" aria-describedby="note-c-${id}">${esc(c.draft)}</textarea><p class="count num" id="note-c-${id}" data-count dir="ltr">${esc(t(L, "notes.count", { n: c.draft.length, max: NOTE_MAX }))}</p>${err}<button type="submit" class="btn btn-primary">${esc(t(L, "cmd.send"))}</button></form>`;
  return `<section class="notes" data-entity="${c.entityType}" data-id="${id}" data-version="${c.noteVersion}" aria-labelledby="notes-h-${id}"><h2 id="notes-h-${id}">${esc(t(L, "notes.title"))}</h2>${list}${saved}${form}</section>`;
}

// ---- drafts: a typed note survives a reload until it is sent (24 h at most) ----------------------------
export type DraftStore = Readonly<{ get(key: string): Promise<string>; set(key: string, text: string): Promise<void>; clear(key: string): Promise<void> }>;
export const draftKey = (type: NoteEntity, id: string): string => `draft.note.${type}.${id}`;
export function createDraftStore(db: Db, now: () => number): DraftStore {
  return {
    async get(key) {
      const row = await db.get<{ text?: unknown; at?: unknown }>("settings", key);
      if (!row || typeof row.text !== "string" || typeof row.at !== "number") return "";
      return now() - row.at > STALE_MS ? "" : row.text;
    },
    async set(key, text) { if (text === "") await db.remove("settings", key); else await db.put("settings", key, { text, at: now() }); },
    async clear(key) { await db.remove("settings", key); },
  };
}

// ---- sending ------------------------------------------------------------------------------------------
export type NotesDeps = Readonly<{ enqueue(i: EnqueueInput): Promise<EnqueueResult>; drafts: DraftStore }>;
export type SubmitResult = "queued" | "empty" | "too_long" | "busy" | "failed";
// The note is saved in the outbox (state queued); the draft is cleared ONLY when that worked, so a refusal never loses the text.
export async function submitNote(target: Pick<NotesCtx, "entityType" | "entityId" | "noteVersion">, raw: string, d: NotesDeps): Promise<SubmitResult> {
  const text = raw.trim();
  if (text === "") return "empty";
  if (text.length > NOTE_MAX) return "too_long";
  let res: EnqueueResult;
  try { res = await d.enqueue({ kind: "command.comments.write", target: { type: target.entityType, id: target.entityId, expectedVersion: target.noteVersion }, labelForUi: text.slice(0, 80), draftText: text }); } catch { return "failed"; }
  if (!res.ok) return res.reason === "target_busy" ? "busy" : "failed";
  await d.drafts.clear(draftKey(target.entityType, target.entityId));
  return "queued";
}

// ---- the DOM glue (delegated on the screen root, so a re-render keeps it) ---------------------------------
export type NotesHandlers = Readonly<{ onDraft(text: string): void; onSend(text: string): void }>;
export function bindNotes(root: HTMLElement, h: NotesHandlers): () => void {
  const area = (e: Event): HTMLTextAreaElement | null => { const el = e.target; return el instanceof HTMLTextAreaElement && el.name === "text" && el.closest("[data-form=composer][data-mode=note]") ? el : null; };
  const onInput = (e: Event): void => {
    const el = area(e); if (!el) return;
    const counter = el.closest("form")?.querySelector("[data-count]"); if (counter) counter.textContent = `${el.value.length} / ${NOTE_MAX}`; // digits only: the same in every language
    h.onDraft(el.value);
  };
  const onSubmit = (e: Event): void => {
    const form = e.target; if (!(form instanceof HTMLFormElement) || form.dataset.form !== "composer" || form.dataset.mode !== "note") return;
    e.preventDefault(); h.onSend(form.querySelector("textarea")?.value ?? "");
  };
  root.addEventListener("input", onInput); root.addEventListener("submit", onSubmit);
  return () => { root.removeEventListener("input", onInput); root.removeEventListener("submit", onSubmit); };
}
