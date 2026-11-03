// LAB ONLY (finding F-0016). Not for a release build.
// Once per wall-clock second the MAIN thread posts one JSON line to a worker
// thread, which appends it to <data dir>/lagrec.jsonl with its own
// appendFileSync, so a slow disk cannot block the main thread through this file.
// Per second: max/sum of 20 ms timer drift, tick count, event-loop-delay max,
// pending resources by type, thread-pool probe (async fs.stat of the node
// binary: slow while the libuv pool is queued), CPU of the main thread (Node
// >= 23.9) or of the whole process. A second with no line = main thread did
// not run.
type Builtin = (id: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Cpu = { user: number; system: number };
type Proc = {
  getBuiltinModule?: Builtin;
  threadCpuUsage?: () => Cpu;
  getActiveResourcesInfo?: () => string[];
};

const TICK_MS = 20;
const WORKER_CODE = `
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
parentPort.on("message", (line) => {
  try { fs.appendFileSync(workerData.file, line + "\\n"); } catch {}
});`;

export function startLagRecorder(): void {
  try {
    const proc = process as unknown as Proc;
    const bi = proc.getBuiltinModule?.bind(process);
    if (!bi) return;
    const { Worker } = bi("node:worker_threads");
    const { performance, monitorEventLoopDelay } = bi("node:perf_hooks");
    const fs = bi("node:fs");
    const file = bi("node:path").join(
      process.env.SF_DATA_DIR || bi("node:os").tmpdir(),
      "lagrec.jsonl",
    );
    const worker = new Worker(WORKER_CODE, { eval: true, workerData: { file } });
    worker.on("error", () => {});
    worker.unref();
    const post = (o: object): void => {
      try {
        worker.postMessage(JSON.stringify(o));
      } catch {}
    };
    const cpuNow = (): Cpu =>
      typeof proc.threadCpuUsage === "function"
        ? proc.threadCpuUsage()
        : process.cpuUsage();
    const eld = monitorEventLoopDelay({ resolution: 10 });
    eld.enable();
    let last = performance.now();
    let cpu = cpuNow();
    let maxDrift = 0, sumDrift = 0, ticks = 0, poolMs = -1, started = 0, done = 0, p0 = 0;
    let lastEmit = Date.now();
    let nextEmit = (Math.floor(lastEmit / 1000) + 1) * 1000;
    post({
      t: lastEmit, boot: true, pid: process.pid, node: process.version,
      cpuKind: typeof proc.threadCpuUsage === "function" ? "thread" : "process",
    });
    const timer = setInterval(() => {
      try {
        const now = performance.now();
        const drift = Math.max(0, now - last - TICK_MS);
        last = now;
        ticks++;
        sumDrift += drift;
        if (drift > maxDrift) maxDrift = drift;
        const wall = Date.now();
        if (wall < nextEmit) return;
        const res: Record<string, number> = {};
        for (const k of proc.getActiveResourcesInfo?.() ?? []) res[k] = (res[k] ?? 0) + 1;
        const c = cpuNow();
        post({
          t: wall, dtMs: wall - lastEmit, maxDriftMs: Math.round(maxDrift),
          ticks, sumDriftMs: Math.round(sumDrift),
          eldMaxMs: Math.round(eld.max / 1e4) / 100, res,
          poolMs, poolOut: started - done,
          poolWaitMs: started > done ? Math.round(now - p0) : 0,
          cpuUserMs: Math.round((c.user - cpu.user) / 1000),
          cpuSysMs: Math.round((c.system - cpu.system) / 1000),
        });
        cpu = c; eld.reset(); lastEmit = wall; maxDrift = 0; sumDrift = 0; ticks = 0;
        nextEmit = (Math.floor(wall / 1000) + 1) * 1000;
        if (started > done) return; // one probe at a time: p0 = oldest pending
        p0 = performance.now();
        started++;
        fs.stat(process.execPath, () => {
          poolMs = Math.round(performance.now() - p0);
          done++;
        });
      } catch {}
    }, TICK_MS);
    timer.unref();
  } catch {
    // Lab recorder: never throws, never blocks.
  }
}
