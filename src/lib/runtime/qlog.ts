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
