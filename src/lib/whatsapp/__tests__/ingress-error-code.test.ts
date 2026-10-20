import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ConflictError, SahelFlowError } from "@/types/errors";

import { ingressErrorCode } from "../ingress-error-code";

/**
 * The code a failed WhatsApp delivery carries back to the sidecar's
 * diagnostics log and into the recovery dock. On 20 Oct the log said only
 * "PrismaClientKnownRequestError" for a first delivery that failed and then
 * healed, which cannot tell a busy database (P1008, P2034) from a real fault.
 * The Prisma code is content-free and says exactly that.
 */
describe("ingressErrorCode", () => {
  it("names a database error and says which one", () => {
    const error = new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "test",
    });
    expect(ingressErrorCode(error)).toBe("PrismaClientKnownRequestError:P2034");
  });

  it("tells a busy database apart from a missing row", () => {
    const busy = new Prisma.PrismaClientKnownRequestError("timed out", {
      code: "P1008",
      clientVersion: "test",
    });
    const missing = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(ingressErrorCode(busy)).not.toBe(ingressErrorCode(missing));
  });

  it("names a database that could not be reached", () => {
    const error = new Prisma.PrismaClientInitializationError(
      "cannot reach the database",
      "test",
      "P1001",
    );
    expect(ingressErrorCode(error)).toBe("PrismaClientInitializationError:P1001");
  });

  it("keeps only the error name when there is no Prisma code", () => {
    expect(ingressErrorCode(new TypeError("boom"))).toBe("TypeError");
    expect(
      ingressErrorCode(new Prisma.PrismaClientValidationError("bad query", { clientVersion: "test" })),
    ).toBe("PrismaClientValidationError");
  });

  it("ignores a code that is not a Prisma code", () => {
    const odd = Object.assign(new Error("x"), { name: "Weird", code: "SELECT * FROM x" });
    expect(ingressErrorCode(odd)).toBe("Weird");
  });

  it("keeps the codes the processor already used", () => {
    expect(ingressErrorCode(new z.ZodError([]))).toBe("INVALID_PROVIDER_PAYLOAD");
    expect(ingressErrorCode(new SahelFlowError("m", "SOME_CODE"))).toBe("SOME_CODE");
    expect(ingressErrorCode(new ConflictError("m"))).toBe("CONFLICT");
    expect(ingressErrorCode("a string")).toBe("INGRESS_PROCESSING_FAILED");
    expect(ingressErrorCode(null)).toBe("INGRESS_PROCESSING_FAILED");
  });

  it("never carries the message, the meta or any customer detail", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on +213550123456 for customer Amel",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["phone"], value: "+213550123456" },
      },
    );
    const code = ingressErrorCode(error);
    expect(code).toBe("PrismaClientKnownRequestError:P2002");
    expect(code).not.toMatch(/213|Amel|phone|Unique/);
  });

  it("stays within the 128 characters the sidecar accepts", () => {
    const long = Object.assign(new Error("x"), { name: "N".repeat(300), code: "P2034" });
    expect(ingressErrorCode(long).length).toBeLessThanOrEqual(128);
    expect(ingressErrorCode(new SahelFlowError("m", "C".repeat(300))).length).toBe(128);
  });
});

describe("the ingress processor reports failures through ingressErrorCode", () => {
  it("uses the shared helper and has no private copy of the old rule", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/whatsapp/inbound-processor.ts"),
      "utf8",
    );
    expect(source).toContain('from "./ingress-error-code"');
    expect(source).toContain("ingressErrorCode(error)");
    expect(source).not.toMatch(/function errorCode\(/);
  });
});
