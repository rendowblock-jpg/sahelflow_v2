import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SahelFlowError } from "@/types/errors";

import {
  asDatabaseBusyError,
  DATABASE_BUSY_CODE,
  DATABASE_BUSY_RETRY_AFTER_SECONDS,
  isDatabaseBusyError,
} from "../database-busy";

/**
 * F-0031. On the Founder's Celeron the log holds HTTP_500 x260: a Prisma
 * timeout thrown while the app saves a message reaches the generic error
 * wrapper, which answers a bare 500 with no code. A busy database is a thing
 * the sidecar should retry and the seller should be told about, so it gets its
 * own 503 code. This table pins which errors count as "busy" and which do not.
 */
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, { code, clientVersion: "test" });

const BUSY: Array<[string, () => unknown]> = [
  ["P1008 socket timeout", () => known("P1008")],
  ["P2028 interactive transaction timeout", () => known("P2028")],
  ["P2034 write conflict", () => known("P2034")],
  ["P1001 cannot reach the database", () => known("P1001")],
  ["P1002 database timed out", () => known("P1002")],
  ["P1017 server closed the connection", () => known("P1017")],
  [
    "PrismaClientInitializationError",
    () => new Prisma.PrismaClientInitializationError("could not start", "test"),
  ],
  [
    "PrismaClientInitializationError with a code",
    () => new Prisma.PrismaClientInitializationError("cannot reach", "test", "P1001"),
  ],
  [
    "unknown request error saying SQLITE_BUSY",
    () => new Prisma.PrismaClientUnknownRequestError("SQLITE_BUSY: database is busy", { clientVersion: "test" }),
  ],
  ["plain Error: SQLITE_BUSY", () => new Error("SQLITE_BUSY")],
  ["plain Error: database is locked", () => new Error("Error in connector: database is locked")],
  [
    "plain Error: Timed out fetching a new connection",
    () => new Error("Timed out fetching a new connection from the connection pool."),
  ],
  ["message in another letter case", () => new Error("DATABASE IS LOCKED")],
];

const NOT_BUSY: Array<[string, () => unknown]> = [
  ["P2002 unique constraint", () => known("P2002")],
  ["P2025 record not found", () => known("P2025")],
  ["P2003 foreign key", () => known("P2003")],
  ["P2010 raw query failed", () => known("P2010")],
  ["plain Error", () => new Error("boom")],
  ["TypeError", () => new TypeError("x is not a function")],
  ["ZodError", () => new z.ZodError([])],
  ["SyntaxError", () => new SyntaxError("Unexpected token")],
  ["a string", () => "database is locked"],
  ["null", () => null],
  ["undefined", () => undefined],
  ["an object with a busy code but no Error", () => ({ code: "P2028" })],
  // Already coded by the app: never re-labelled, even if its text mentions locking.
  [
    "SahelFlowError whose text mentions a lock",
    () => new SahelFlowError("database is locked by the backup", "BACKUP_IN_PROGRESS", 409),
  ],
  ["SahelFlowError 503 with another code", () => new SahelFlowError("later", "SOMETHING_ELSE", 503)],
];

describe("database busy classification (F-0031)", () => {
  it.each(BUSY)("%s is busy", (_name, make) => {
    expect(isDatabaseBusyError(make())).toBe(true);
    const mapped = asDatabaseBusyError(make());
    expect(mapped).toBeInstanceOf(SahelFlowError);
    expect(mapped).toMatchObject({
      message: "The local database was busy",
      code: "DATABASE_BUSY",
      statusCode: 503,
    });
  });

  it.each(NOT_BUSY)("%s is not busy", (_name, make) => {
    expect(isDatabaseBusyError(make())).toBe(false);
    expect(asDatabaseBusyError(make())).toBeNull();
  });

  it("never carries the original message (it can hold a customer's number)", () => {
    const mapped = asDatabaseBusyError(new Error("database is locked while saving 213555000111"));
    expect(mapped?.message).toBe("The local database was busy");
    expect(JSON.stringify(mapped)).not.toContain("213555000111");
  });

  it("publishes a constant retry hint of 5 seconds", () => {
    expect(DATABASE_BUSY_RETRY_AFTER_SECONDS).toBe(5);
    expect(DATABASE_BUSY_CODE).toBe("DATABASE_BUSY");
  });

  it("the code survives the sidecar's failure-code filters", () => {
    const health = readFileSync(
      join(process.cwd(), "sidecars/whatsapp/ingress-health.ts"),
      "utf8",
    );
    expect(health).toContain("const FAILURE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;");
    // The spool's own, stricter filter for codes it derives from a thrown error.
    const spool = readFileSync(
      join(process.cwd(), "sidecars/whatsapp/inbound-spool.ts"),
      "utf8",
    );
    expect(spool).toContain("/^[A-Za-z0-9_]{1,40}$/");
    expect(DATABASE_BUSY_CODE).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
    expect(DATABASE_BUSY_CODE).toMatch(/^[A-Za-z0-9_]{1,40}$/);
  });
});
