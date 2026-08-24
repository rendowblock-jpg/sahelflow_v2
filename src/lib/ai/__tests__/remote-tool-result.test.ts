import { describe, expect, it } from "vitest";

import {
  redactCustomerName,
  serializeToolResultForRemoteModel,
} from "../redact";

const FULL_NAME = "Karim Benali";
const SECOND_NAME = "Amine Ould Ali";
const PHONE = "0555123456";
const SECOND_PHONE = "0661789012";
const STREET = "12 Rue Didouche Mourad, Alger Centre";
const NOTES = "Call Karim Benali at 0555123456 near 12 Rue Didouche Mourad";

function serialized(toolName: string, value: unknown): string {
  return JSON.stringify(serializeToolResultForRemoteModel(toolName, value));
}

describe("redactCustomerName", () => {
  it("keeps only first name plus family-name initial", () => {
    expect(redactCustomerName(FULL_NAME)).toBe("Karim B.");
    expect(redactCustomerName(SECOND_NAME)).toBe("Amine A.");
    expect(redactCustomerName("Karim")).toBe("Karim");
    expect(redactCustomerName("  كريم بن علي  ")).toBe("كريم ع.");
  });
});

describe("serializeToolResultForRemoteModel — customer/contact read tools", () => {
  it("allowlists search_customers and drops unexpected future PII fields", () => {
    const output = serializeToolResultForRemoteModel("search_customers", [
      {
        id: "cust-1",
        name: FULL_NAME,
        phone: PHONE,
        wilaya: "Alger",
        orderCount: 4,
        totalSpent: 42000,
        email: "karim.private@example.com",
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]).toEqual({
      id: "cust-1",
      name: "Karim B.",
      phone: "0•••••••56",
      wilaya: "Alger",
      orderCount: 4,
      totalSpent: 42000,
    });
    expect(JSON.stringify(output)).not.toContain(FULL_NAME);
    expect(JSON.stringify(output)).not.toContain(PHONE);
    expect(JSON.stringify(output)).not.toContain("karim.private@example.com");
  });

  it("minimizes get_order_details without touching product names", () => {
    const output = serializeToolResultForRemoteModel("get_order_details", {
      id: "order-1",
      orderNumber: "CMD-1001",
      status: "confirmed",
      totalPrice: 18000,
      deliveryCost: 800,
      wilaya: "Alger",
      commune: "Alger Centre",
      phone: PHONE,
      notes: NOTES,
      source: "manual",
      createdAt: "2026-08-24T10:00:00.000Z",
      confirmedAt: null,
      shippedAt: null,
      deliveredAt: null,
      customer: { id: "cust-1", name: FULL_NAME, phone: PHONE },
      items: [
        {
          productName: "Atlas Premium Hoodie",
          quantity: 2,
          unitPrice: 9000,
          total: 18000,
          internalUnexpectedField: "drop-me",
        },
      ],
      delivery: {
        status: "created",
        provider: "yalidine",
        trackingNumber: "TRK-1",
      },
      unexpectedCustomerAddress: STREET,
    }) as Record<string, unknown>;

    const text = JSON.stringify(output);
    expect(text).toContain("Karim B.");
    expect(text).toContain("0•••••••56");
    expect(text).toContain("Atlas Premium Hoodie");
    expect(text).not.toContain(FULL_NAME);
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(NOTES);
    expect(text).not.toContain(STREET);
    expect(output.hasNotes).toBe(true);
  });

  it("minimizes list_recent_orders", () => {
    const text = serialized("list_recent_orders", [
      {
        orderNumber: "CMD-1002",
        customerName: FULL_NAME,
        status: "shipped",
        totalPrice: 12000,
        wilaya: "Oran",
        createdAt: "2026-08-24T10:00:00.000Z",
      },
    ]);
    expect(text).toContain("Karim B.");
    expect(text).not.toContain(FULL_NAME);
  });

  it("minimizes get_customer_details including phone2, street address, and notes", () => {
    const output = serializeToolResultForRemoteModel("get_customer_details", {
      id: "cust-2",
      name: SECOND_NAME,
      phone: PHONE,
      phone2: SECOND_PHONE,
      wilaya: "Oran",
      commune: "Oran",
      address: STREET,
      notes: NOTES,
      orderCount: 7,
      totalSpent: 80000,
      riskScore: 12,
      createdAt: "2026-08-20T10:00:00.000Z",
      orders: [
        {
          orderNumber: "CMD-77",
          status: "delivered",
          totalPrice: 9000,
          createdAt: "2026-08-22T10:00:00.000Z",
          unexpectedPhone: PHONE,
        },
      ],
    }) as Record<string, unknown>;

    const text = JSON.stringify(output);
    expect(text).toContain("Amine A.");
    expect(text).not.toContain(SECOND_NAME);
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(SECOND_PHONE);
    expect(text).not.toContain(STREET);
    expect(text).not.toContain(NOTES);
    expect(output.hasStreetAddress).toBe(true);
    expect(output.hasNotes).toBe(true);
    expect(output.wilaya).toBe("Oran");
    expect(output.commune).toBe("Oran");
  });

  it("minimizes search_conversations", () => {
    const text = serialized("search_conversations", [
      {
        id: "conv-1",
        channel: "whatsapp",
        contactName: FULL_NAME,
        contactPhone: PHONE,
        lastMessageAt: "2026-08-24T10:00:00.000Z",
        unreadCount: 2,
      },
    ]);
    expect(text).toContain("Karim B.");
    expect(text).not.toContain(FULL_NAME);
    expect(text).not.toContain(PHONE);
  });

  it("minimizes get_pending_deliveries customerName", () => {
    const text = serialized("get_pending_deliveries", [
      {
        id: "delivery-1",
        provider: "maystro",
        status: "in_transit",
        trackingNumber: "TRACK-8",
        shippingCost: 700,
        createdAt: "2026-08-24T10:00:00.000Z",
        orderNumber: "CMD-8",
        customerName: FULL_NAME,
        wilaya: "Blida",
      },
    ]);
    expect(text).toContain("Karim B.");
    expect(text).not.toContain(FULL_NAME);
  });

  it("withholds get_conversation_messages bodies while preserving safe metadata", () => {
    const output = serializeToolResultForRemoteModel("get_conversation_messages", [
      {
        id: "msg-1",
        direction: "inbound",
        body: "Karim Benali lives at 12 Rue Didouche Mourad; call 0555123456",
        timestamp: "2026-08-24T10:00:00.000Z",
        extracted: false,
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]).toEqual({
      id: "msg-1",
      direction: "inbound",
      body: null,
      bodyWithheld: true,
      timestamp: "2026-08-24T10:00:00.000Z",
      extracted: false,
    });
    const text = JSON.stringify(output);
    expect(text).not.toContain(FULL_NAME);
    expect(text).not.toContain(STREET);
    expect(text).not.toContain(PHONE);
  });

  it("minimizes search_orders customer identity", () => {
    const text = serialized("search_orders", [
      {
        orderNumber: "CMD-900",
        status: "confirmed",
        totalPrice: 25000,
        wilaya: "Setif",
        createdAt: "2026-08-24T10:00:00.000Z",
        customerName: FULL_NAME,
        customerPhone: PHONE,
      },
    ]);
    expect(text).toContain("Karim B.");
    expect(text).not.toContain(FULL_NAME);
    expect(text).not.toContain(PHONE);
  });
});

describe("serializeToolResultForRemoteModel — negative controls and proposals", () => {
  it("keeps ordinary product/category/store-style names readable", () => {
    const products = serializeToolResultForRemoteModel("search_products", [
      {
        id: "p1",
        name: "Atlas Premium Hoodie",
        category: "Winter Collection",
        price: 9000,
      },
    ]);
    const topProducts = serializeToolResultForRemoteModel("get_top_products", [
      { name: "Atlas Premium Hoodie", quantity: 12, revenue: 108000 },
    ]);

    expect(JSON.stringify(products)).toContain("Atlas Premium Hoodie");
    expect(JSON.stringify(products)).toContain("Winter Collection");
    expect(JSON.stringify(topProducts)).toContain("Atlas Premium Hoodie");
  });

  it("minimizes customer proposal summaries while keeping full digest local", () => {
    const output = serializeToolResultForRemoteModel("create_customer", {
      pending_action_proposal: true,
      tool: "create_customer",
      proposal: {
        id: "aip-123",
        toolName: "create_customer",
        status: "pending",
        proposalDigestPrefix: "abcdef123456",
        summary: {
          customerName: FULL_NAME,
          phoneLast4: "3456",
          wilaya: "Alger",
        },
        expiresAt: "2026-08-24T20:00:00.000Z",
        createdAt: "2026-08-24T19:00:00.000Z",
        executionState: null,
        lastErrorCode: null,
      },
      proposalDigest: "trusted-digest-kept-local",
    }) as Record<string, unknown>;

    const proposal = output.proposal as Record<string, unknown>;
    const summary = proposal.summary as Record<string, unknown>;
    expect(proposal.id).toBe("aip-123");
    expect(proposal.proposalDigestPrefix).toBe("abcdef123456");
    expect(summary.customerName).toBe("Karim B.");
    expect(summary.phoneLast4).toBe("••56");
    expect(output.proposalDigest).toBeUndefined();
  });

  it("sanitizes legacy create_customer and update_customer_notes history shapes", () => {
    const customer = serializeToolResultForRemoteModel("create_customer", {
      id: "cust-legacy",
      name: FULL_NAME,
      phone: PHONE,
      wilaya: "Alger",
      address: STREET,
    });
    const notes = serializeToolResultForRemoteModel("update_customer_notes", {
      customerId: "cust-legacy",
      notes: NOTES,
    });

    expect(JSON.stringify(customer)).toContain("Karim B.");
    expect(JSON.stringify(customer)).not.toContain(FULL_NAME);
    expect(JSON.stringify(customer)).not.toContain(PHONE);
    expect(JSON.stringify(customer)).not.toContain(STREET);
    expect(notes).toEqual({ customerId: "cust-legacy", hasNotes: true });
  });
});
