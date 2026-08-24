import { describe, expect, it } from "vitest";

import { serializeToolResultForRemoteModel } from "../redact";

const FULL_NAME = "Karim Benali";
const PHONE = "0555123456";
const STREET = "12 Rue Didouche Mourad, Alger Centre";

describe("remote AI PII serializer shape drift", () => {
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
    expect(JSON.stringify(output)).not.toContain(PHONE);
  });

  it("fails closed for non-string generic phone and address wrappers", () => {
    const output = serializeToolResultForRemoteModel("future_non_pii_tool", {
      name: "Legitimate product name",
      phone: { raw: PHONE },
      address: { raw: STREET },
    }) as Record<string, unknown>;

    expect(output.name).toBe("Legitimate product name");
    expect(output.phone).toBeNull();
    expect(output.address).toBeNull();
    expect(JSON.stringify(output)).not.toContain(PHONE);
    expect(JSON.stringify(output)).not.toContain(STREET);
  });

  it("preserves only the standard error envelope on a mismatched PII result", () => {
    const output = serializeToolResultForRemoteModel("search_customers", {
      error: `Lookup failed for ${PHONE}`,
      name: FULL_NAME,
      address: STREET,
    });
    expect(output).toEqual({ error: "Lookup failed for 0•••••••56" });
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(STREET);
  });

  it("allowlists the pending proposal envelope and customer summary", () => {
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
    expect(output.proposalDigest).toBe("trusted-digest");
  });

  it("withholds drifted PII wrappers from proposal summaries", () => {
    const output = serializeToolResultForRemoteModel("create_customer", {
      pending_action_proposal: true,
      tool: "create_customer",
      proposal: {
        id: "aip-wrapper",
        toolName: "create_customer",
        status: "pending",
        proposalDigestPrefix: "abcdef123456",
        summary: {
          customerName: { raw: FULL_NAME },
          phoneLast4: { raw: "3456", phone: PHONE },
          wilaya: "Alger",
        },
        expiresAt: "2026-08-24T20:00:00.000Z",
        createdAt: "2026-08-24T19:00:00.000Z",
        executionState: null,
        lastErrorCode: null,
      },
      proposalDigest: "trusted-digest",
    }) as {
      proposal?: { summary?: Record<string, unknown> };
    };

    expect(output.proposal?.summary?.customerName).toBeNull();
    expect(output.proposal?.summary?.phoneLast4).toBeNull();
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(PHONE);
  });
});
