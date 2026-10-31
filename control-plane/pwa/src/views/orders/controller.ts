// W3-F4 step 4: what a tap does. No DOM here: the screen file passes in the names and values it read from the page.
import { REJECT_REASON_KEYS, type OrdersProjection } from "../../../../../src/lib/connected-platform/contracts";
import type { Locale } from "../../i18n";
import type { EnqueueInput, EnqueueResult } from "../../outbox/outbox";
import type { OutboxRecord } from "../../outbox/state";
import { draftKey, submitNote, type DraftStore, type NotesError } from "../notes";
import { renderOrderDetail } from "./detail";
import { renderOrdersList } from "./list";
import { canAct, changedSinceOpened, isFilter, isPending, latestCommandFor, openCommandFor, type OrderFilter, type OrdersModel, type ReadStatus } from "./model";

export type OrdersHost = Readonly<{
  now(): number; locale(): Locale; online(): boolean; pcOff(): boolean; timeZone?: string;
  read(): Readonly<{ status: ReadStatus; data: OrdersProjection | null; asOf: number | null }>;
  reload(): Promise<void>;
  commands(): Promise<readonly OutboxRecord[]>;
  enqueue(i: EnqueueInput): Promise<EnqueueResult>;
  drafts: DraftStore;
  authorityExpiresAt(): number | undefined;
  go(screen: "orders" | "order"): void;
  subscribe(fn: () => void): () => void;
}>;
export type ActData = Readonly<{ id?: string; filter?: string; reason?: string; text?: string }>;

export function createOrdersController(host: OrdersHost) {
  let filter: OrderFilter = "confirm"; let openId: string | null = null; let openedVersion: number | null = null;
  let sheet: "confirm" | "reject" | null = null; let draft = ""; let noteError: NotesError | null = null; let notice: "busy" | "failed" | null = null;
  let commands: readonly OutboxRecord[] = [];

  function model(): OrdersModel {
    const r = host.read(); const authority = host.authorityExpiresAt();
    return {
      locale: host.locale(), now: host.now(), online: host.online(), pcOff: host.pcOff(), ...(host.timeZone ? { timeZone: host.timeZone } : {}),
      read: r.status, data: r.data, asOf: r.asOf, commands, filter, openId, openedVersion, sheet, draft, noteError, notice, ...(authority === undefined ? {} : { authorityExpiresAt: authority }),
    };
  }
  const currentOrder = () => host.read().data?.orders.find((o) => o.id === openId);
  // A decision is possible only on a pending order, on a copy under 24 h old, with no command open on it and no unseen change.
  function allowed(): boolean {
    const m = model(); const o = currentOrder();
    return o !== undefined && isPending(o) && canAct(m) && openCommandFor(m, o.id) === undefined && !changedSinceOpened(m, o);
  }
  // W196: a screen told that a command changed re-reads ONLY the commands (the draft the seller is typing is not touched).
  async function refreshCommands(): Promise<void> { commands = await host.commands(); }
  async function refresh(): Promise<void> {
    commands = await host.commands();
    draft = openId ? await host.drafts.get(draftKey("order", openId)) : "";
  }
  async function decide(kind: "command.orders.confirm" | "command.orders.reject", reasonKey: string): Promise<void> {
    const o = currentOrder();
    if (!o || !allowed()) { sheet = null; return; }
    const res = await host.enqueue({ kind, target: { type: "order", id: o.id, expectedVersion: o.version }, labelForUi: o.orderNumber, draftText: reasonKey });
    sheet = null; notice = res.ok ? null : res.reason === "target_busy" ? "busy" : "failed";
    await refresh();
  }
  async function act(name: string, d: ActData): Promise<void> {
    switch (name) {
      case "filter": if (isFilter(d.filter)) filter = d.filter; return;
      case "open-order": case "order-review": {
        const o = host.read().data?.orders.find((x) => x.id === d.id);
        openId = d.id ?? null; openedVersion = o?.version ?? null; sheet = null; notice = null; noteError = null;
        await refresh(); host.go("order"); return;
      }
      case "back": openId = null; sheet = null; notice = null; draft = ""; host.go("orders"); return;
      case "orders-retry": await host.reload(); await refresh(); return;
      case "confirm-open": if (allowed()) sheet = "confirm"; return;
      case "reject-open": if (allowed()) sheet = "reject"; return;
      case "sheet-cancel": sheet = null; return;
      case "confirm-yes": if (sheet === "confirm") await decide("command.orders.confirm", ""); return;
      case "reject-yes": {
        const reason = (REJECT_REASON_KEYS as readonly string[]).find((k) => k === d.reason);
        if (sheet !== "reject" || reason === undefined) return; // a reason is REQUIRED, one of the four keys, never free text
        await decide("command.orders.reject", reason); return;
      }
      case "ack-change": { const o = currentOrder(); if (o) openedVersion = o.version; return; }
      case "cmd-retry": {
        // Only a deliberate new tap: the sheet opens again. Never for ORDER_CHANGED / ORDER_ALREADY_*, never by itself.
        const id = d.id ?? openId; if (!id) return;
        const last = latestCommandFor(model(), id); const code = last?.resultCode;
        if (!last || code === "ORDER_CHANGED" || code?.startsWith("ORDER_ALREADY_") || last.state === "committed") return;
        await act("open-order", { id });
        if (allowed()) sheet = last.kind === "command.orders.reject" ? "reject" : "confirm";
        return;
      }
      case "note-draft": if (openId) { draft = d.text ?? ""; await host.drafts.set(draftKey("order", openId), draft); } return;
      case "note-send": {
        const o = currentOrder(); if (!o || !canAct(model())) return;
        const text = d.text ?? draft;
        const r = await submitNote({ entityType: "order", entityId: o.id, noteVersion: o.noteVersion }, text, { enqueue: (i) => host.enqueue(i), drafts: host.drafts });
        noteError = r === "queued" ? null : r === "empty" ? "empty" : r === "too_long" ? "long" : r === "busy" ? "busy" : "send";
        await refresh(); // the draft is read back from the store: cleared when the note was saved, kept otherwise
        if (r !== "queued") draft = text;
        return;
      }
      default: return;
    }
  }
  return { model, html: (): string => (openId ? renderOrderDetail(model()) : renderOrdersList(model())), act, refresh, refreshCommands };
}
