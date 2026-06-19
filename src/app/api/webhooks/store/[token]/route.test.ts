/**
 * Webhook Store Route Tests (T7)
 *
 * The old test was 100% tautological — it stubbed global crypto.subtle.verify
 * then asserted on the mock. ZERO production code was exercised. The real route
 * handler uses Node's createHmac (via @/lib/webhook-verify), not Web Crypto.
 *
 * This rewrite mocks at the module boundary (@supabase/supabase-js,
 * @/lib/agents/orchestrator, @/lib/rate-limit, @/lib/data/order-service) and
 * exercises the REAL POST handler with REAL HMAC verification.
 *
 * Coverage:
 *  - test-mode bypass
 *  - rate limiting (429)
 *  - invalid JSON (400)
 *  - invalid token (401)
 *  - Shopify HMAC: valid sig accepted, invalid sig rejected, missing secret rejected
 *  - WooCommerce HMAC: valid sig accepted, invalid sig rejected, missing integration rejected
 *  - YouCan HMAC: valid sig accepted, invalid sig rejected
 *  - platform detection (header + payload fallback)
 *  - dedup by event ID (23505 unique violation → "already processed")
 *  - dedup by external_id (existing order → "already exists")
 *  - successful order creation via atomic_create_order RPC
 *  - dispatch to orchestrator
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// ── Hoisted mocks (declared before vi.mock) ─────────────────────────────────
const {
  mockCreateClient,
  mockDispatch,
  mockRateLimit,
  mockRateLimitHeaders,
  mockFindExisting,
} = vi.hoisted(() => {
  const supabaseChain: any = {};
  return {
    mockCreateClient: vi.fn(() => supabaseChain),
    mockDispatch: vi.fn().mockResolvedValue(undefined),
    mockRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, limit: 30 }),
    mockRateLimitHeaders: vi.fn(() => ({})),
    mockFindExisting: vi.fn().mockResolvedValue(null),
    // expose for test setup
    _supabaseChain: supabaseChain,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/agents/orchestrator", () => ({
  dispatch: mockDispatch,
}));

vi.mock("@/lib/rate-limit", async () => ({
  rateLimit: mockRateLimit,
  rateLimitHeaders: mockRateLimitHeaders,
}));

vi.mock("@/lib/data/order-service", () => ({
  findExistingOrderByExternalId: mockFindExisting,
}));

// Import POST AFTER mocks are set up
import { POST } from "./route";

// ── Test helpers ────────────────────────────────────────────────────────────

const SELLER = {
  id: "seller-1",
  webhook_token: "valid-token-123",
  webhook_orders_count: 5,
};

const SELLER_RPC_RESULT = {
  order_id: "ord-1",
  order_number: "SF-001",
  customer_id: "cust-1",
  status: "pending",
};

/** Build a mock supabase client chain with canned responses per table + RPC. */
function buildSupabaseClient(opts: {
  seller?: any | null;
  sellerError?: any;
  wcIntegration?: any | null;
  youcanIntegration?: any | null;
  webhookInsertError?: any;
  rpcResult?: any;
  rpcError?: any;
} = {}) {
  const {
    seller = SELLER,
    sellerError = null,
    wcIntegration = null,
    youcanIntegration = null,
    webhookInsertError = null,
    rpcResult = SELLER_RPC_RESULT,
    rpcError = null,
  } = opts;

  let currentTable = "";
  let currentMethod = "";

  const chain: any = {
    from: vi.fn((t: string) => {
      currentTable = t;
      return chain;
    }),
    select: vi.fn(() => {
      currentMethod = "select";
      return chain;
    }),
    insert: vi.fn(() => {
      currentMethod = "insert";
      return chain;
    }),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => {
      if (currentTable === "integrations" && currentMethod === "select") {
        // Return WC or YouCan integration based on which was queried.
        // We can't easily distinguish here, so use a side-effect approach.
        return Promise.resolve({ data: wcIntegration || youcanIntegration, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    single: vi.fn(() => {
      if (currentTable === "sellers") {
        return Promise.resolve({ data: seller, error: sellerError });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    then: vi.fn((resolve: any, reject?: any) => {
      // For .insert() on webhook_events — return insert error or success
      if (currentTable === "webhook_events" && currentMethod === "insert") {
        const result = webhookInsertError
          ? { data: null, error: webhookInsertError }
          : { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      }
      // For .update() on sellers — return success
      if (currentTable === "sellers" && currentMethod === "update") {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      }
      // For .insert() on agent_activity — return success
      if (currentTable === "agent_activity" && currentMethod === "insert") {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      }
      // Default
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }),
    rpc: vi.fn(() => {
      if (rpcError) return Promise.resolve({ data: null, error: rpcError });
      return Promise.resolve({ data: rpcResult, error: null });
    }),
  };

  return chain;
}

/** Build a real Shopify HMAC signature (base64). */
function signShopify(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

/** Build a real WooCommerce HMAC signature (hex). */
function signWooCommerce(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Build a real YouCan HMAC signature (hex). */
function signYouCan(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Build a Shopify order webhook body. */
function shopifyBody(): string {
  return JSON.stringify({
    id: 1234567890,
    email: "ahmed@example.com",
    total_price: "150.00",
    shipping_address: { first_name: "Ahmed", phone: "0555123456", city: "Alger" },
    line_items: [{ id: 1, title: "Parfum", quantity: 2, price: "75.00" }],
  });
}

/** Build a WooCommerce order webhook body. */
function wcBody(): string {
  return JSON.stringify({
    id: 100,
    billing: { first_name: "Sara", phone: "0661234567", city: "Oran" },
    line_items: [{ id: 1, name: "Crème", quantity: 1, total: "75.00" }],
    total: "75.00",
  });
}

/** Build a YouCan order webhook body. */
function youcanBody(): string {
  return JSON.stringify({
    id: "yc-order-1",
    customer_name: "Karim",
    customer_phone: "0771234567",
    shipping: { wilaya: "Constantine" },
    payment: { method: "cod" },
    variants: [{ name: "Huile", quantity: 1, price: 500 }],
    total_price: 500,
  });
}

/** Build a minimal custom order body. */
function customBody(): string {
  return JSON.stringify({
    customer_name: "Fatima",
    customer_phone: "0559876543",
    total_price: 1000,
    items: [{ name: "Produit", quantity: 1, price: 1000 }],
  });
}

function makeRequest(
  token: string,
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost/api/webhooks/store/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "shopify-secret-123");
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 29, limit: 30 });
  mockFindExisting.mockResolvedValue(null);
  mockDispatch.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/store/[token] (T7 — real route handler)", () => {
  describe("test-mode bypass", () => {
    it("returns success with test=true when X-SahelFlow-Test header is set (T7)", async () => {
      mockCreateClient.mockReturnValue(buildSupabaseClient());
      const req = makeRequest("any-token", "{}", { "X-SahelFlow-Test": "true" });

      const res = await POST(req, { params: Promise.resolve({ token: "any-token" }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ success: true, test: true });
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit exceeded (T7)", async () => {
      mockCreateClient.mockReturnValue(buildSupabaseClient());
      mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 30 });

      const req = makeRequest("token", customBody());
      const res = await POST(req, { params: Promise.resolve({ token: "token" }) });

      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toContain("Too many requests");
    });
  });

  describe("invalid input", () => {
    it("returns 400 for invalid JSON body (T7)", async () => {
      mockCreateClient.mockReturnValue(buildSupabaseClient());
      const req = makeRequest("token", "not-json{");

      const res = await POST(req, { params: Promise.resolve({ token: "token" }) });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid JSON");
    });
  });

  describe("seller token lookup", () => {
    it("returns 401 when seller not found for token (T7)", async () => {
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({ seller: null, sellerError: { message: "not found" } }),
      );
      const req = makeRequest("bad-token", customBody());

      const res = await POST(req, { params: Promise.resolve({ token: "bad-token" }) });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Invalid token");
    });
  });

  describe("Shopify HMAC verification (real verifyShopifyHmac)", () => {
    it("accepts a valid Shopify HMAC signature and creates order (T7)", async () => {
      const body = shopifyBody();
      const sig = signShopify(body, "shopify-secret-123");
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", body, {
        "X-Shopify-Topic": "orders/create",
        "X-Shopify-Hmac-Sha256": sig,
        "X-Shopify-Event-Id": "evt-1",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Should have dispatched to orchestrator
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "order.created",
        orderId: "ord-1",
        sellerId: "seller-1",
      });
    });

    it("rejects an invalid Shopify HMAC signature with 401 (T7)", async () => {
      mockCreateClient.mockReturnValue(buildSupabaseClient());
      const req = makeRequest("valid-token-123", shopifyBody(), {
        "X-Shopify-Topic": "orders/create",
        "X-Shopify-Hmac-Sha256": "invalid-base64-signature",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Invalid HMAC");
    });

    it("rejects a tampered Shopify body (signature mismatch) with 401 (T7)", async () => {
      const originalBody = shopifyBody();
      const sig = signShopify(originalBody, "shopify-secret-123");
      const tamperedBody = JSON.stringify({ ...JSON.parse(originalBody), total_price: "999.99" });
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", tamperedBody, {
        "X-Shopify-Topic": "orders/create",
        "X-Shopify-Hmac-Sha256": sig,
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });

      expect(res.status).toBe(401);
    });

    it("returns 401 when SHOPIFY_WEBHOOK_SECRET env var is missing (T7)", async () => {
      vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", shopifyBody(), {
        "X-Shopify-Topic": "orders/create",
        "X-Shopify-Hmac-Sha256": "any-sig",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });

      expect(res.status).toBe(401);
    });
  });

  describe("WooCommerce HMAC verification (real verifyWooCommerceHmac)", () => {
    it("accepts a valid WooCommerce HMAC signature (T7)", async () => {
      const body = wcBody();
      const wcSecret = "wc-secret-456";
      const sig = signWooCommerce(body, wcSecret);
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({
          wcIntegration: { credentials: { webhook_secret: wcSecret } },
        }),
      );

      const req = makeRequest("valid-token-123", body, {
        "X-WC-Webhook-Topic": "order.created",
        "X-WC-Webhook-Signature": sig,
        "X-WC-Webhook-Delivery-ID": "wc-delivery-1",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("rejects an invalid WooCommerce HMAC signature with 401 (T7)", async () => {
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({
          wcIntegration: { credentials: { webhook_secret: "wc-secret-456" } },
        }),
      );

      const req = makeRequest("valid-token-123", wcBody(), {
        "X-WC-Webhook-Topic": "order.created",
        "X-WC-Webhook-Signature": "invalid-hex-sig",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Invalid WooCommerce");
    });

    it("rejects when WooCommerce integration has no webhook_secret (T7)", async () => {
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({ wcIntegration: null }),
      );

      const req = makeRequest("valid-token-123", wcBody(), {
        "X-WC-Webhook-Topic": "order.created",
        "X-WC-Webhook-Signature": "any-sig",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(401);
    });
  });

  describe("YouCan HMAC verification (real verifyYouCanHmac)", () => {
    it("accepts a valid YouCan HMAC signature (T7)", async () => {
      const body = youcanBody();
      const ycSecret = "yc-secret-789";
      const sig = signYouCan(body, ycSecret);
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({
          youcanIntegration: { credentials: { webhook_secret: ycSecret } },
        }),
      );

      const req = makeRequest("valid-token-123", body, {
        "x-youcan-signature": sig,
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("rejects an invalid YouCan HMAC signature with 401 (T7)", async () => {
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({
          youcanIntegration: { credentials: { webhook_secret: "yc-secret-789" } },
        }),
      );

      const req = makeRequest("valid-token-123", youcanBody(), {
        "x-youcan-signature": "invalid-hex-sig",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(401);
    });
  });

  describe("platform detection", () => {
    it("detects Shopify from X-Shopify-Topic header (T7)", async () => {
      const body = shopifyBody();
      const sig = signShopify(body, "shopify-secret-123");
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", body, {
        "X-Shopify-Topic": "orders/create",
        "X-Shopify-Hmac-Sha256": sig,
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(200);
    });

    it("falls back to custom platform for unrecognized bodies (T7)", async () => {
      // Custom body with customer_name — no platform headers
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", customBody());

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("deduplication by event ID", () => {
    it("returns 'Event already processed' on 23505 unique violation (T7)", async () => {
      const body = shopifyBody();
      const sig = signShopify(body, "shopify-secret-123");
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({
          webhookInsertError: { code: "23505", message: "duplicate" },
        }),
      );

      const req = makeRequest("valid-token-123", body, {
        "X-Shopify-Topic": "orders/create",
        "X-Shopify-Hmac-Sha256": sig,
        "X-Shopify-Event-Id": "evt-dup-1",
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toContain("already processed");
    });
  });

  describe("deduplication by external_id", () => {
    it("returns 'Order already exists' when external_id matches existing order (T7)", async () => {
      const body = shopifyBody();
      const sig = signShopify(body, "shopify-secret-123");
      mockFindExisting.mockResolvedValue({ id: "existing-ord-1" });
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", body, {
        "X-Shopify-Topic": "orders/create",
        "X-Shopify-Hmac-Sha256": sig,
      });

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toContain("already exists");
    });
  });

  describe("successful order creation", () => {
    it("dispatches order.created event to orchestrator after RPC success (T7)", async () => {
      const body = customBody();
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", body);

      await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "order.created",
        orderId: "ord-1",
        sellerId: "seller-1",
      });
    });

    it("calls atomic_create_order RPC with the 18-arg payload (T7)", async () => {
      const body = customBody();
      const client = buildSupabaseClient();
      mockCreateClient.mockReturnValue(client);

      const req = makeRequest("valid-token-123", body);

      await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });

      expect(client.rpc).toHaveBeenCalledWith(
        "atomic_create_order",
        expect.objectContaining({
          p_seller_id: "seller-1",
          p_source: "custom",
          p_status: "pending",
          p_delivery_type: "home",
        }),
      );
      // Verify 18 params
      const payload = client.rpc.mock.calls[0][1];
      expect(Object.keys(payload)).toHaveLength(18);
    });
  });

  describe("error handling", () => {
    it("returns 500 when atomic_create_order RPC throws (T7)", async () => {
      const body = customBody();
      mockCreateClient.mockReturnValue(
        buildSupabaseClient({ rpcError: { message: "Insufficient stock" } }),
      );

      const req = makeRequest("valid-token-123", body);

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(500);
    });

    it("returns 400 when order data cannot be normalized (T7)", async () => {
      // Empty body with no recognizable fields → normalizeOrder returns null
      mockCreateClient.mockReturnValue(buildSupabaseClient());

      const req = makeRequest("valid-token-123", JSON.stringify({ foo: "bar" }));

      const res = await POST(req, { params: Promise.resolve({ token: "valid-token-123" }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Could not parse");
    });
  });
});
