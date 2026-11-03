/**
 * The 5-minute session-activity write (lastSeenAt "touch").
 *
 * Lab evidence (SIMULATED slow disk, n = 2 per arm): about 5 minutes after the
 * session started the whole local server stopped answering for seconds and one
 * request was refused with 503 "Authentication authority is temporarily
 * unavailable". The touch used to be awaited inside every request that saw an
 * old lastSeenAt, so on a single SQLite connection with a slow synced commit
 * N concurrent requests queued N identical writes and all of them waited, and
 * a failed write refused a request that was already fully authenticated.
 *
 * These tests pin the new contract: one touch per session per interval, the
 * request never waits for it, a failure only delays the next attempt, and a
 * touch that finds the row revoked refuses the session at its next request.
 *
 * Real SQLite test database for the session rows and cookies; only
 * `db.session.updateMany` is replaced by a controllable function. Only `Date`
 * is faked (Prisma needs the real timers), so "budgets" below are real-time
 * races with a generous limit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn((key: string) =>
      map.has(key) ? { value: map.get(key) } : undefined,
    ),
    set: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    delete: vi.fn((key: string) => {
      map.delete(key);
    }),
    reset: () => map.clear(),
  };
});

type UpdateManyResult = { count: number };
type UpdateManyArgs = { where: { id: string; revokedAt: null } };

const touchHarness = vi.hoisted(() => ({
  updateMany: null as null | ((args: UpdateManyArgs) => Promise<UpdateManyResult>),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieJar.get,
    set: cookieJar.set,
    delete: cookieJar.delete,
  })),
}));

// Pass everything through to the real database client except
// `session.updateMany`, and only while a test has installed a replacement.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const sessionProxy = new Proxy(actual.db.session, {
    get(target, prop) {
      if (prop === "updateMany" && touchHarness.updateMany) {
        return touchHarness.updateMany;
      }
      return Reflect.get(target, prop);
    },
  });
  const dbProxy = new Proxy(actual.db, {
    get(target, prop) {
      if (prop === "session") return sessionProxy;
      return Reflect.get(target, prop);
    },
  });
  return { ...actual, db: dbProxy };
});

delete process.env.AUTH_SECRET;
delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;

import { dbRaw } from "@/lib/db";
import { AUTH_COOKIE, SESSION_ACTIVITY_WRITE_INTERVAL_MS } from "../config";
import { getSessionIdFromToken } from "../crypto";
import * as authServer from "../server";

const { createSession, getCurrentSessionAuthority, setupAuth } = authServer;

const MINUTE = 60_000;
const SECOND = 1_000;
/** Back-off after a failed touch (must match the implementation). */
const BACKOFF = 30 * SECOND;
/** Real-time limit for "the request did not wait for the write". */
const NO_WAIT_BUDGET_MS = 4_000;

let startMs = 0;
function setClock(offsetMs: number): void {
  vi.setSystemTime(new Date(startMs + offsetMs));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Let fire-and-forget promise handlers and the database queue run. */
async function settle(): Promise<void> {
  await sleep(40);
}

async function cleanDb(): Promise<void> {
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
}

/** Create a session (at clock 0) and return its id and cookie value. */
async function makeSession(): Promise<{ id: string; token: string }> {
  await createSession();
  const token = cookieJar.map.get(AUTH_COOKIE);
  if (!token) throw new Error("createSession did not set the cookie");
  const id = getSessionIdFromToken(token);
  if (!id) throw new Error("token has no session id");
  return { id, token };
}

function useSession(session: { token: string }): void {
  cookieJar.map.set(AUTH_COOKIE, session.token);
}

function install(
  impl: (args: UpdateManyArgs) => Promise<UpdateManyResult>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(impl);
  touchHarness.updateMany = fn as unknown as typeof touchHarness.updateMany;
  return fn;
}

beforeEach(async () => {
  delete process.env.AUTH_SECRET;
  delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;
  cookieJar.reset();
  touchHarness.updateMany = null;
  // Optional call: the red run happens against code that does not have it.
  (authServer as { __resetSessionTouchTracker?: () => void })
    .__resetSessionTouchTracker?.();
  await cleanDb();
  startMs = Date.now();
  await setupAuth("12345678");
  vi.useFakeTimers({ toFake: ["Date"], now: startMs });
});

afterEach(async () => {
  vi.useRealTimers();
  touchHarness.updateMany = null;
  delete process.env.AUTH_SECRET;
  await cleanDb();
});

describe("session activity touch", () => {
  it("is 5 minutes (the interval the tests below are written around)", () => {
    expect(SESSION_ACTIVITY_WRITE_INTERVAL_MS).toBe(5 * MINUTE);
  });

  it("(1) starts exactly ONE write for 20 concurrent resolutions of the same session", async () => {
    const session = await makeSession();
    setClock(6 * MINUTE);
    // The row keeps its old lastSeenAt until a write commits, like a slow
    // disk: every concurrent request sees the old value.
    const updateMany = install(async () => {
      await sleep(30);
      return { count: 1 };
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => getCurrentSessionAuthority()),
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: session.id, revokedAt: null } }),
    );
    for (const result of results) {
      expect(result).toMatchObject({
        status: "authenticated",
        sessionId: session.id,
      });
    }
  });

  it("(2a) answers authenticated while the write never resolves", async () => {
    const session = await makeSession();
    setClock(6 * MINUTE);
    const never = new Promise<UpdateManyResult>(() => {});
    const updateMany = install(() => never);

    const outcome = await Promise.race([
      getCurrentSessionAuthority(),
      sleep(NO_WAIT_BUDGET_MS).then(() => "WAITED_FOR_THE_WRITE" as const),
    ]);

    expect(outcome).not.toBe("WAITED_FOR_THE_WRITE");
    expect(outcome).toMatchObject({
      status: "authenticated",
      sessionId: session.id,
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("(2b) answers authenticated, not SESSION_AUTHORITY_UNAVAILABLE, when the write rejects", async () => {
    const session = await makeSession();
    setClock(6 * MINUTE);
    const updateMany = install(async () => {
      throw new Error("disk busy");
    });

    const outcome = await getCurrentSessionAuthority();
    await settle();

    expect(outcome).toMatchObject({
      status: "authenticated",
      sessionId: session.id,
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("(3) after a failed write waits the back-off, then tries again", async () => {
    const session = await makeSession();
    setClock(6 * MINUTE);
    const updateMany = install(async () => {
      throw new Error("fsync stalled");
    });

    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
    });
    await settle();
    expect(updateMany).toHaveBeenCalledTimes(1);

    // Inside the back-off: still served, no new write.
    setClock(6 * MINUTE + BACKOFF - 5 * SECOND);
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
      sessionId: session.id,
    });
    await settle();
    expect(updateMany).toHaveBeenCalledTimes(1);

    // After the back-off: one more attempt, not 20.
    setClock(6 * MINUTE + BACKOFF + 5 * SECOND);
    await Promise.all(
      Array.from({ length: 5 }, () => getCurrentSessionAuthority()),
    );
    await settle();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("(4) a write that finds no live row (count 0) refuses that session at its next request", async () => {
    const session = await makeSession();
    setClock(6 * MINUTE);
    install(async () => ({ count: 0 }));

    // The request that started the write is not held up and is answered from
    // the authority it already read.
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
      sessionId: session.id,
    });
    await settle();

    // The database row still looks live (the write is mocked), so only the
    // recorded outcome can refuse the session here.
    setClock(6 * MINUTE + 2 * SECOND);
    await expect(getCurrentSessionAuthority()).resolves.toEqual({
      status: "rejected",
      code: "SESSION_REVOKED",
    });
  });

  it("(4b) a session revoked in the database is still refused at the next request", async () => {
    const session = await makeSession();
    setClock(6 * MINUTE);
    await dbRaw.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(startMs + 5 * MINUTE) },
    });
    const updateMany = install(async () => ({ count: 1 }));

    await expect(getCurrentSessionAuthority()).resolves.toEqual({
      status: "rejected",
      code: "SESSION_REVOKED",
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("(5) does no write while lastSeenAt is under 5 minutes old", async () => {
    const session = await makeSession();
    const updateMany = install(async () => ({ count: 1 }));

    setClock(0);
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
      sessionId: session.id,
    });
    setClock(4 * MINUTE + 59 * SECOND);
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
      sessionId: session.id,
    });
    await settle();

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("(6) writes once at the interval, not again inside it, and once more after it", async () => {
    await makeSession();
    const updateMany = install(async () => ({ count: 1 }));

    setClock(5 * MINUTE);
    await getCurrentSessionAuthority();
    await settle();
    expect(updateMany).toHaveBeenCalledTimes(1);

    // The mocked write does not move the row, so the row keeps looking old;
    // the process-side memo must hold the next write back for a full interval.
    setClock(5 * MINUTE + 4 * MINUTE);
    await Promise.all(
      Array.from({ length: 10 }, () => getCurrentSessionAuthority()),
    );
    await settle();
    expect(updateMany).toHaveBeenCalledTimes(1);

    setClock(5 * MINUTE + SESSION_ACTIVITY_WRITE_INTERVAL_MS + SECOND);
    await Promise.all(
      Array.from({ length: 10 }, () => getCurrentSessionAuthority()),
    );
    await settle();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("(6b) a write that never settles does not stop the next interval's write", async () => {
    await makeSession();
    const updateMany = install(() => new Promise<UpdateManyResult>(() => {}));

    setClock(6 * MINUTE);
    await getCurrentSessionAuthority();
    expect(updateMany).toHaveBeenCalledTimes(1);

    setClock(6 * MINUTE + 10 * SECOND);
    await getCurrentSessionAuthority();
    expect(updateMany).toHaveBeenCalledTimes(1);

    setClock(6 * MINUTE + SESSION_ACTIVITY_WRITE_INTERVAL_MS + SECOND);
    await getCurrentSessionAuthority();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("(7) two different sessions touch independently", async () => {
    const a = await makeSession();
    const b = await makeSession();
    expect(a.id).not.toBe(b.id);
    setClock(6 * MINUTE);
    const updateMany = install(async ({ where }) => {
      // Session A's disk write hangs; B's commits.
      if (where.id === a.id) return new Promise<UpdateManyResult>(() => {});
      return { count: 1 };
    });

    useSession(a);
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
      sessionId: a.id,
    });
    useSession(b);
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
      sessionId: b.id,
    });
    expect(updateMany).toHaveBeenCalledTimes(2);
    const touched = updateMany.mock.calls.map(
      (call) => (call[0] as UpdateManyArgs).where.id,
    );
    expect(new Set(touched)).toEqual(new Set([a.id, b.id]));

    // Each is now memoised on its own.
    useSession(a);
    await getCurrentSessionAuthority();
    useSession(b);
    await getCurrentSessionAuthority();
    await settle();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("(7b) a revoked outcome for one session does not refuse another", async () => {
    const a = await makeSession();
    const b = await makeSession();
    setClock(6 * MINUTE);
    install(async ({ where }) => ({ count: where.id === a.id ? 0 : 1 }));

    useSession(a);
    await getCurrentSessionAuthority();
    useSession(b);
    await getCurrentSessionAuthority();
    await settle();

    setClock(6 * MINUTE + SECOND);
    useSession(a);
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "rejected",
      code: "SESSION_REVOKED",
    });
    useSession(b);
    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
      sessionId: b.id,
    });
  });

  it("(8) when the disk is healthy the write still lands in the row", async () => {
    const session = await makeSession();
    setClock(6 * MINUTE);

    await expect(getCurrentSessionAuthority()).resolves.toMatchObject({
      status: "authenticated",
    });

    const expected = startMs + 6 * MINUTE;
    let seen = 0;
    for (let attempt = 0; attempt < 50 && seen !== expected; attempt += 1) {
      await sleep(40);
      const row = await dbRaw.session.findUniqueOrThrow({
        where: { id: session.id },
      });
      seen = row.lastSeenAt.getTime();
    }
    expect(seen).toBe(expected);
  });
});
