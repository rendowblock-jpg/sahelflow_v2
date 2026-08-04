import { describe, expect, it } from "vitest";

import { assertProtectedMutationBoundary } from "@/lib/crypto/with-protected-mutation-boundary";

describe("protected Prisma mutation boundary", () => {
  it("rejects returning bulk mutations for protected models", () => {
    for (const model of ["Customer", "Order", "Conversation", "Message"]) {
      for (const operation of ["createManyAndReturn", "updateManyAndReturn"]) {
        expect(() =>
          assertProtectedMutationBoundary(model, operation, { data: {} }),
        ).toThrowError(
          expect.objectContaining({
            code: "PROTECTED_DATA_RETURNING_BULK_WRITE_BLOCKED",
          }),
        );
      }
    }
  });

  it("blocks protected creates nested below an unprotected parent", () => {
    expect(() =>
      assertProtectedMutationBoundary("Delivery", "create", {
        data: {
          trackingNumber: "D-42",
          order: {
            create: {
              id: "order-42",
              phone: "0555123456",
              address: "Alger",
            },
          },
        },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "PROTECTED_DATA_NESTED_WRITE_BLOCKED" }),
    );
  });

  it("allows relation connects and unprotected mutations", () => {
    expect(() =>
      assertProtectedMutationBoundary("Delivery", "create", {
        data: { order: { connect: { id: "order-42" } } },
      }),
    ).not.toThrow();
    expect(() =>
      assertProtectedMutationBoundary("Product", "updateManyAndReturn", {
        data: { price: 2500 },
      }),
    ).not.toThrow();
  });
});
