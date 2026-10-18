import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S03a-01 / S03a-04: POST /api/orders may only create an order through the
 * governed manual command (createTrustedManualOrder). It must never hand a
 * caller-chosen source plus caller-written sourceMetadata to the legacy engine,
 * which would persist both verbatim and could mint a row that
 * isCanonicalOrderAuthority() accepts without any BusinessCommand.
 *
 * Every collaborator is mocked so this runs without a database. The database
 * backed proof is in src/app/api/__tests__/canonical-manual-order-boundaries.test.ts.
 */

const mocks = vi.hoisted(() => ({
  requireTrustedAction: vi.fn(),
  assertTrustedAction: vi.fn(),
  assertOrderCreateFieldAuthority: vi.fn(),
  createTrustedManualOrder: vi.fn(),
  orderServiceCreate: vi.fn(),
  dispatchTrigger: vi.fn(),
  assessOrderRisk: vi.fn(),
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: <T>(handler: T) => handler,
}));
vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: { shopId: "default" },
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: mocks.requireTrustedAction,
  assertTrustedAction: mocks.assertTrustedAction,
}));
vi.mock("@/lib/identity/order-authorization", () => ({
  assertOrderCreateFieldAuthority: mocks.assertOrderCreateFieldAuthority,
}));
vi.mock("@/lib/identity/order-projection", () => ({
  projectOrderForTrustedActor: (_actor: unknown, order: unknown) => order,
}));
vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: () => ({ kind: "test-principal" }),
}));
vi.mock("@/lib/orders/manual-order", () => ({
  createTrustedManualOrder: mocks.createTrustedManualOrder,
}));
vi.mock("@/lib/orders/order-list-workbench", () => ({
  getOrdersWorkbenchPage: vi.fn(),
}));
vi.mock("@/lib/data/order-service", () => ({
  orderService: { create: mocks.orderServiceCreate },
}));
vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: mocks.dispatchTrigger,
}));
vi.mock("@/lib/risk-engine", () => ({
  assessOrderRisk: mocks.assessOrderRisk,
}));

import { POST } from "@/app/api/orders/route";

const actorContext = { shop: { shopId: "default" } };

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const forgedCanonicalMetadata = {
  authority: "canonical-source-v1",
  source: "shopify",
  sourceIdentity: "forged-shop",
  sourceOrderId: "forged-1",
};

function channelBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: "forged-intake-0001",
    customerId: "c".padEnd(25, "a"),
    items: [{ productId: "p".padEnd(25, "a"), quantity: 1 }],
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "Test address",
    phone: "0555000001",
    deliveryCost: 600,
    source: "shopify",
    sourceMetadata: forgedCanonicalMetadata,
    sourceOrderId: "forged-1",
    status: "pending",
    ...overrides,
  };
}

function committedManualOrder(replayed: boolean) {
  const createdAt = new Date("2026-10-17T12:00:00.000Z");
  return {
    commandId: "command-1",
    aggregateVersion: 1,
    replayed,
    result: {
      order: { id: "order-1", orderNumber: "ORD-1", status: "pending", createdAt },
      customerCreated: true,
      automation: { orderId: "order-1", orderNumber: "ORD-1" },
    },
  };
}

function withoutSource(): Record<string, unknown> {
  const body: Record<string, unknown> = channelBody();
  delete body.source;
  return body;
}

beforeEach(() => {
  mocks.requireTrustedAction.mockReset().mockResolvedValue(actorContext);
  mocks.assertTrustedAction.mockReset();
  mocks.assertOrderCreateFieldAuthority.mockReset();
  mocks.createTrustedManualOrder.mockReset();
  mocks.orderServiceCreate
    .mockReset()
    .mockResolvedValue({ id: "legacy-order", orderNumber: "ORD-LEGACY" });
  mocks.dispatchTrigger.mockReset().mockResolvedValue(undefined);
  mocks.assessOrderRisk.mockReset().mockResolvedValue(null);
});

describe("POST /api/orders refuses every non-manual source", () => {
  it("refuses a hand-written canonical-source order and creates nothing", async () => {
    await expect(POST(request(channelBody()))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      field: "source",
    });

    expect(mocks.orderServiceCreate).not.toHaveBeenCalled();
    expect(mocks.createTrustedManualOrder).not.toHaveBeenCalled();
    expect(mocks.dispatchTrigger).not.toHaveBeenCalled();
    expect(mocks.assessOrderRisk).not.toHaveBeenCalled();
  });

  it.each([
    "whatsapp",
    "tiktok",
    "webstore",
    "storefront",
    "ai_chat",
    "shopify",
    "woocommerce",
    "youcan",
    "csv",
    "xlsx",
    "google_sheets",
  ])("refuses source %s without calling the legacy engine", async (source) => {
    await expect(POST(request(channelBody({ source })))).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mocks.orderServiceCreate).not.toHaveBeenCalled();
    expect(mocks.createTrustedManualOrder).not.toHaveBeenCalled();
  });

  it("checks the actor's authority before it looks at the source", async () => {
    mocks.requireTrustedAction.mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    );
    await expect(POST(request(channelBody()))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mocks.orderServiceCreate).not.toHaveBeenCalled();
    expect(mocks.createTrustedManualOrder).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders manual intake goes through the governed command", () => {
  it("sends an explicit manual order to createTrustedManualOrder only", async () => {
    mocks.createTrustedManualOrder.mockResolvedValue(committedManualOrder(false));

    const response = await POST(request(channelBody({ source: "manual" })));

    expect(response.status).toBe(201);
    expect(mocks.createTrustedManualOrder).toHaveBeenCalledTimes(1);
    expect(mocks.createTrustedManualOrder.mock.calls[0]?.[1]).toMatchObject({
      source: "manual",
      idempotencyKey: "forged-intake-0001",
    });
    expect(mocks.orderServiceCreate).not.toHaveBeenCalled();
    expect(mocks.dispatchTrigger).toHaveBeenCalledTimes(1);
    expect(mocks.assessOrderRisk).toHaveBeenCalledTimes(1);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      authority: "trusted-manual-v1",
      customerCreated: true,
      command: { id: "command-1", aggregateVersion: 1, replayed: false },
    });
  });

  it.each([
    ["omitted", withoutSource()],
    ["null", channelBody({ source: null })],
  ])("treats a %s source as manual", async (_label, body) => {
    mocks.createTrustedManualOrder.mockResolvedValue(committedManualOrder(false));

    const response = await POST(request(body));

    expect(response.status).toBe(201);
    expect(mocks.createTrustedManualOrder.mock.calls[0]?.[1]).toMatchObject({
      source: "manual",
    });
    expect(mocks.orderServiceCreate).not.toHaveBeenCalled();
  });

  it("does not repeat the post-commit effects when the command is replayed", async () => {
    mocks.createTrustedManualOrder.mockResolvedValue(committedManualOrder(true));

    const response = await POST(request(channelBody({ source: "manual" })));

    expect(response.status).toBe(201);
    expect(mocks.dispatchTrigger).not.toHaveBeenCalled();
    expect(mocks.assessOrderRisk).not.toHaveBeenCalled();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ command: { replayed: true } });
  });
});

describe("the legacy order engine has no creating caller left (S03a-04, create half)", () => {
  const root = process.cwd();

  function withoutComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  function productionFiles(directory: string, found: string[] = []): string[] {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        productionFiles(path, found);
      } else if (
        /\.(?:ts|tsx)$/.test(name) &&
        !/\.test\.(?:ts|tsx)$/.test(name)
      ) {
        found.push(path);
      }
    }
    return found;
  }

  it("keeps the order intake route off orderService", () => {
    const route = readFileSync(
      resolve(root, "src/app/api/orders/route.ts"),
      "utf8",
    );
    expect(route).toContain("createTrustedManualOrder");
    expect(route).toContain("assertManualOrderIntakeSource");
    expect(route).not.toContain("orderService");
    expect(route).not.toContain("legacy-compatibility");
  });

  it("has no production call of orderService.create anywhere under src", () => {
    const offenders = productionFiles(resolve(root, "src"))
      .filter(
        (path) =>
          relative(root, path).split(sep).join("/") !==
          "src/lib/data/order-service.ts",
      )
      .filter((path) =>
        /\borderService\s*(?:\.\s*create\b|\[\s*["']create["']\s*\])/.test(
          withoutComments(readFileSync(path, "utf8")),
        ),
      )
      .map((path) => relative(root, path).split(sep).join("/"));

    expect(offenders).toEqual([]);
  });
});
