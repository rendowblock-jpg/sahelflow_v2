import { describe, expect, it } from "vitest";

import { EXPECTED_AI_TOOL_NAMES } from "../actions/contracts";
import {
  AI_REMOTE_SERIALIZATION_TOOL_NAMES,
  serializeToolResultForRemoteModel,
} from "../redact";

const FULL_NAME = "Karim Benali";
const PHONE = "0555123456";
const STREET = "12 Rue Didouche Mourad, Alger Centre";

describe("remote AI PII serializer shape drift", () => {
  it("classifies every registered AI tool and fails closed for unknown tools", () => {
    expect(AI_REMOTE_SERIALIZATION_TOOL_NAMES).toEqual(EXPECTED_AI_TOOL_NAMES);
    expect(
      serializeToolResultForRemoteModel("future_unclassified_tool", {
        name: "Should not cross",
      }),
    ).toBeNull();
  });

  it("fails closed when an array-shaped PII tool unexpectedly returns an object", () => {
    const output = serializeToolResultForRemoteModel("search_customers", {
      id: "cust-drift",
      name: FULL_NAME,
      phone: PHONE,
    });
    expect(output).toBeNull();
  });

  it("fails closed when an object-shaped PII tool unexpectedly returns an array", () => {
    const output = serializeToolResultForRemoteModel("get_customer_details", [
      { name: FULL_NAME, phone: PHONE, address: STREET },
    ]);
    expect(output).toBeNull();
  });

  it("withholds non-string PII fields inside otherwise valid allowlisted records", () => {
    const output = serializeToolResultForRemoteModel("search_customers", [
      {
        id: "cust-wrapper",
        name: { raw: FULL_NAME },
        phone: { raw: PHONE },
        wilaya: "Alger",
        orderCount: 2,
        totalSpent: 12000,
      },
    ]) as Array<Record<string, unknown>>;

    expect(output).toHaveLength(1);
    expect(output[0]?.name).toBeNull();
    expect(output[0]?.phone).toBeNull();
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(PHONE);
  });

  it("withholds wrapper objects from every nominally operational allowlisted field", () => {
    const output = serializeToolResultForRemoteModel("search_customers", [
      {
        id: { address: STREET },
        name: "Karim",
        phone: "0555123456",
        wilaya: { rawPhone: PHONE },
        orderCount: { raw: 2, address: STREET },
        totalSpent: { raw: 12000, phone: PHONE },
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]).toMatchObject({
      id: null,
      wilaya: null,
      orderCount: null,
      totalSpent: null,
    });
    expect(JSON.stringify(output)).not.toContain(STREET);
    expect(JSON.stringify(output)).not.toContain(PHONE);
  });

  it("canonicalizes parseable timestamps instead of returning comment-bearing input", () => {
    const output = serializeToolResultForRemoteModel("search_orders", [
      {
        orderNumber: "CMD-1",
        status: "confirmed",
        totalPrice: 1000,
        wilaya: "Alger",
        createdAt: `Mon, 24 Aug 2026 19:00:00 GMT (${FULL_NAME} ${PHONE})`,
        customerName: "Karim",
        customerPhone: PHONE,
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]?.createdAt).toBe("2026-08-24T19:00:00.000Z");
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(PHONE);
  });

  it("withholds all free-form conversation bodies from the remote projection", () => {
    const output = serializeToolResultForRemoteModel("get_conversation_messages", [
      {
        id: "msg-wrapper",
        direction: "inbound",
        body: `Karim Benali lives at ${STREET}; call ${PHONE}`,
        timestamp: "2026-08-24T19:00:00.000Z",
        extracted: false,
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]?.body).toBeNull();
    expect(output[0]?.bodyWithheld).toBe(true);
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(STREET);
    expect(JSON.stringify(output)).not.toContain(PHONE);
  });

  it("withholds non-string conversation bodies instead of serializing nested PII", () => {
    const output = serializeToolResultForRemoteModel("get_conversation_messages", [
      {
        id: "msg-wrapper",
        direction: "inbound",
        body: { raw: `Call me on ${PHONE}` },
        timestamp: "2026-08-24T19:00:00.000Z",
        extracted: false,
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]?.body).toBeNull();
    expect(output[0]?.bodyWithheld).toBe(false);
    expect(JSON.stringify(output)).not.toContain(PHONE);
  });

  it("fails closed for non-string generic phone and address wrappers on reviewed safe tools", () => {
    const output = serializeToolResultForRemoteModel("search_products", [
      {
        name: "Legitimate product name",
        phone: { raw: PHONE },
        address: { raw: STREET },
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]?.name).toBe("Legitimate product name");
    expect(output[0]?.phone).toBeNull();
    expect(output[0]?.address).toBeNull();
    expect(JSON.stringify(output)).not.toContain(PHONE);
    expect(JSON.stringify(output)).not.toContain(STREET);
  });

  it("preserves only a stable error marker on a mismatched PII result", () => {
    const output = serializeToolResultForRemoteModel("search_customers", {
      error: `Lookup failed for ${PHONE} near ${STREET}`,
      name: FULL_NAME,
      address: STREET,
    });
    expect(output).toEqual({ error: "Tool failed" });
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(PHONE);
    expect(JSON.stringify(output)).not.toContain(STREET);
  });

  it("allowlists the pending proposal envelope while withholding full authority digest", () => {
    const output = serializeToolResultForRemoteModel("create_customer", {
      pending_action_proposal: true,
      tool: "create_customer",
      proposal: {
        id: "aip-drift",
        toolName: "create_customer",
        status: "pending",
        proposalDigestPrefix: "abcdef123456",
        summary: {
          customerName: FULL_NAME,
          phoneLast4: "3456",
          wilaya: "Alger",
          streetAddress: STREET,
          rawPhone: PHONE,
        },
        expiresAt: "2026-08-24T20:00:00.000Z",
        createdAt: "2026-08-24T19:00:00.000Z",
        executionState: null,
        lastErrorCode: null,
        unexpectedAddress: STREET,
      },
      proposalDigest: "trusted-digest",
      unexpectedCustomerName: FULL_NAME,
    }) as Record<string, unknown>;

    const text = JSON.stringify(output);
    expect(text).toContain("Karim B.");
    expect(text).toContain("••56");
    expect(text).not.toContain(FULL_NAME);
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(STREET);
    expect(output.proposalDigest).toBeUndefined();
  });

  it("withholds drifted PII and operational wrappers from proposal projections", () => {
    const output = serializeToolResultForRemoteModel("create_customer", {
      pending_action_proposal: true,
      tool: { address: STREET },
      proposal: {
        id: { address: STREET },
        toolName: { phone: PHONE },
        status: { raw: "pending", address: STREET },
        proposalDigestPrefix: { phone: PHONE },
        summary: {
          customerName: { raw: FULL_NAME },
          phoneLast4: { raw: "3456", phone: PHONE },
          wilaya: { address: STREET },
        },
        expiresAt: { raw: "2026-08-24T20:00:00.000Z", phone: PHONE },
        createdAt: { raw: "2026-08-24T19:00:00.000Z", address: STREET },
        executionState: { address: STREET },
        lastErrorCode: { phone: PHONE },
      },
      proposalDigest: "trusted-digest",
    }) as {
      tool?: unknown;
      proposal?: Record<string, unknown> & { summary?: Record<string, unknown> };
      proposalDigest?: unknown;
    };

    expect(output.tool).toBe("create_customer");
    expect(output.proposalDigest).toBeUndefined();
    expect(output.proposal).toMatchObject({
      id: null,
      toolName: "create_customer",
      status: null,
      proposalDigestPrefix: null,
      expiresAt: null,
      createdAt: null,
      executionState: null,
      lastErrorCode: null,
    });
    expect(output.proposal?.summary).toMatchObject({
      customerName: null,
      phoneLast4: null,
      wilaya: null,
    });
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(PHONE);
    expect(JSON.stringify(output)).not.toContain(STREET);
  });
});
