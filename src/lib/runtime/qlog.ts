// LAB ONLY (finding F-0016, diagnostic "qlog"). Not for a release build.
// Query timing log: every Prisma query event (incl. BEGIN/COMMIT) with
// duration >= 100 ms is appended to <data dir>/qlog.jsonl, plus one
// {t, n} line per second with the number of queries seen in that second,
// plus {t, kind:'session-touch', dur} records written by auth/server.ts.
// Lines are buffered in memory and flushed once per second with the async
// fs API, so the log itself never blocks the main thread. No query params.
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SLOW_MS = 100;

type QueryEvent = { duration: number; query: string };
type Hookable = { $on: (event: "query", cb: (e: QueryEvent) => void) => void };

let buffer: string[] = [];
let count = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let writing = false;

function file(): string {
  return join(process.env.SF_DATA_DIR || tmpdir(), "qlog.jsonl");
}

function flush(): void {
  const now = Date.now();
  reportOpenTransactions(now);
  if (count > 0) buffer.push(JSON.stringify({ t: now, n: count }));
  count = 0;
  if (buffer.length === 0 || writing) return;
  const data = buffer.join("\n") + "\n";
  buffer = [];
  writing = true;
  appendFile(file(), data)
    .catch(() => {})
    .finally(() => {
      writing = false;
    });
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(flush, 1000);
  timer.unref?.();
  buffer.push(
    JSON.stringify({ t: Date.now(), boot: true, pid: process.pid, kind: "qlog" }),
  );
}

export function qlogRecord(rec: Record<string, unknown>): void {
  try {
    ensureTimer();
    buffer.push(JSON.stringify({ t: Date.now(), ...rec }));
  } catch {}
}

/** Log option for `new PrismaClient({ log })`: query events + the given stdout levels. */
export function qlogLogOption(
  stdoutLevels: ReadonlyArray<"warn" | "error">,
): Array<{ emit: "event" | "stdout"; level: "query" | "warn" | "error" }> {
  return [
    { emit: "event", level: "query" },
    ...stdoutLevels.map((level) => ({ emit: "stdout" as const, level })),
  ];
}

/** Attach the query-event handler to a client created with qlogLogOption. */
export function qlogAttach<T>(client: T, tag: string): T {
  try {
    ensureTimer();
    (client as unknown as Hookable).$on("query", (e) => {
      count += 1;
      if (e.duration >= SLOW_MS) {
        buffer.push(
          JSON.stringify({
            t: Date.now(),
            dur: e.duration,
            q: e.query.slice(0, 100),
            c: tag,
          }),
        );
      }
    });
  } catch {}
  return client;
}

// ---- Transaction tracer (LAB ONLY, finding F-0019, txl) --------------------
// Records every INTERACTIVE Prisma transaction (db.$transaction(async tx => ..))
// made through the application clients: one {kind:'tx'} line when it ends and,
// once a second, one {kind:'tx-open'} line while any transaction is older than
// 1000 ms. Only a Map and the existing buffer are touched; no sync fs.
const TX_BUFFER_CAP = 20000;
const OPEN_MS = 1000;
type OpenTx = { t0: number; tb: number; c: string; err: Error };
const openTx = new Map<number, OpenTx>();
let txSeq = 0;

function frames(err: Error, n: number): string[] {
  const out: string[] = [];
  try {
    const lines = String(err.stack ?? "").split("\n").slice(1);
    for (const raw of lines) {
      if (raw.includes("node_modules") || raw.includes("node:internal")) continue;
      const line = raw
        .trim()
        .replace(/^at\s+/, "")
        .replace(/\\/g, "/")
        .replace(/(?:file:\/\/\/?)?(?:[A-Za-z]:)?(?:\/[^/()\s]+)*?\/(src|\.next|resources)\//g, "$1/");
      out.push(line.slice(0, 200));
      if (out.length >= n) break;
    }
  } catch {}
  return out;
}

function pushTx(rec: Record<string, unknown>): void {
  if (buffer.length < TX_BUFFER_CAP) buffer.push(JSON.stringify(rec));
}

function reportOpenTransactions(now: number): void {
  try {
    if (openTx.size === 0) return;
    const old = [...openTx.values()]
      .filter((o) => now - o.t0 > OPEN_MS)
      .sort((a, b) => a.t0 - b.t0);
    if (old.length === 0) return;
    pushTx({
      t: now,
      kind: "tx-open",
      n: openTx.size,
      nOld: old.length,
      oldest: old.slice(0, 3).map((o) => ({
        age: now - o.t0,
        body: o.tb ? now - o.tb : -1,
        c: o.c,
        caller: frames(o.err, 2).join(" < "),
        stack: frames(o.err, 6),
      })),
    });
  } catch {}
}

/** Wrap `$transaction` (interactive form only) of an application client. */
export function qlogWrapTransaction<T extends object>(client: T, tag: string): T {
  try {
    ensureTimer();
    return new Proxy(client, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (prop !== "$transaction" || typeof value !== "function") return value;
        return function qlogTx(...args: unknown[]) {
          const fn = args[0];
          if (typeof fn !== "function") return Reflect.apply(value, target, args);
          let rec: OpenTx | undefined;
          let id = 0;
          try {
            const err = new Error();
            const keep = Error.stackTraceLimit;
            Error.stackTraceLimit = 14;
            Error.captureStackTrace(err, qlogTx);
            Error.stackTraceLimit = keep;
            id = ++txSeq;
            rec = { t0: Date.now(), tb: 0, c: tag, err };
            openTx.set(id, rec);
          } catch {}
          const me = rec;
          const done = (ok: boolean, e?: unknown): void => {
            try {
              if (!me) return;
              openTx.delete(id);
              const t1 = Date.now();
              const dur = t1 - me.t0;
              const r: Record<string, unknown> = {
                t: t1,
                kind: "tx",
                t0: me.t0,
                t1,
                dur,
                ok,
                c: tag,
                caller: frames(me.err, 2).join(" < "),
              };
              if (me.tb) {
                r.bstart = me.tb - me.t0;
                r.body = t1 - me.tb;
              }
              if (!ok) {
                const x = e as { code?: string; message?: string } | undefined;
                r.err = `${x?.code ?? ""} ${String(x?.message ?? e)}`.trim().slice(0, 160);
              }
              if (!ok || dur >= 500) {
                r.stack = frames(me.err, 8);
                r.fn = Function.prototype.toString.call(fn).slice(0, 200);
              }
              if (args[1]) r.opts = JSON.stringify(args[1]).slice(0, 80);
              pushTx(r);
            } catch {}
          };
          const wrapped = (...a: unknown[]) => {
            if (me) me.tb = Date.now();
            return (fn as (...x: unknown[]) => unknown)(...a);
          };
          let result: unknown;
          try {
            result = Reflect.apply(value, target, [wrapped, ...args.slice(1)]);
          } catch (e) {
            done(false, e);
            throw e;
          }
          return Promise.resolve(result).then(
            (r) => {
              done(true);
              return r;
            },
            (e) => {
              done(false, e);
              throw e;
            },
          );
        };
      },
    });
  } catch {
    return client;
  }
}
