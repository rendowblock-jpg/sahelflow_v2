/**
 * fix-B6 — Gemini consent gate integration tests.
 *
 * Verifies that:
 *   - POST /api/extraction returns 403 consent_required when the
 *     `gemini_consent_accepted` setting is unset / false (and never calls
 *     Gemini — fetch is mocked to fail the test if it is).
 *   - POST /api/extraction proceeds past the gate when consent is true
 *     (regex-only mode is exercised to avoid real Gemini calls).
 *   - POST /api/ai/sessions/[id]/messages returns 403 consent_required
 *     without consent.
 *   - POST /api/ai/sessions/[id]/messages/stream returns 403
 *     consent_required without consent.
 *
 * The consent gate is the S1 privacy fix: it prevents raw WhatsApp message
 * bodies (containing customer PII) from being sent to Google Gemini's
 * free-tier API (which may train on inputs) until the seller has explicitly
 * opted in via Settings → AI.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rawDb, cleanDb, mockPost, getJson } from "@/app/api/__tests__/helpers";

// Mock next/headers — requireAuth() reads cookies. With a clean DB (no
// AuthSecret row), isAuthenticated() returns true (setup mode) — an empty
// cookie jar passes requireAuth. We never test 401 here (covered elsewhere).
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { POST as POSTExtraction } from "@/app/api/extraction/route";
import { POST as POSTMessage } from "@/app/api/ai/sessions/[id]/messages/route";
import { POST as POSTStream } from "@/app/api/ai/sessions/[id]/messages/stream/route";

/** Set the consent setting directly (bypasses the public setSetting guard,
 * which is fine for trusted test setup — same pattern as the SV-M1/M2 tests). */
async function setConsent(value: boolean) {
  await rawDb.setting.upsert({
    where: { key: "gemini_consent_accepted" },
    update: { value: String(value) },
    create: { key: "gemini_consent_accepted", value: String(value) },
  });
}

/** Build a Gemini-style JSON Response (used to confirm the gate does NOT
 * short-circuit when consent is given — we mock fetch to fail loudly so any
 * accidental Gemini call is observable). */
function geminiOkResponse(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ── /api/extraction ────────────────────────────────────────────────────────

describe("fix-B6: POST /api/extraction — consent gate", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("returns 403 consent_required when the setting is unset (no Gemini call)", async () => {
    // Mock fetch — if the gate fails, the test fails loudly.
    const fetchSpy = vi.fn().mockResolvedValue(geminiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      // Do NOT set the consent setting.
      const res = await POSTExtraction(
        mockPost("http://localhost/api/extraction", {
          body: "2x iPhone 14 Alger 0661234567",
        }),
      );
      expect(res.status).toBe(403);
      const body = await getJson(res);
      expect(body.error).toBe("consent_required");
      expect(body.message).toMatch(/Settings/i);
      // No Gemini call should have happened.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns 403 consent_required when the setting is explicitly false", async () => {
    await setConsent(false);
    const fetchSpy = vi.fn().mockResolvedValue(geminiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await POSTExtraction(
        mockPost("http://localhost/api/extraction", {
          body: "2x iPhone 14 Alger 0661234567",
        }),
      );
      expect(res.status).toBe(403);
      const body = await getJson(res);
      expect(body.error).toBe("consent_required");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("proceeds past the consent gate when consent is true (regex-only, no Gemini)", async () => {
    await setConsent(true);
    // A complete regex-matchable message — extraction should succeed via
    // regex WITHOUT calling Gemini. fetch is mocked to fail if it does.
    const fetchSpy = vi.fn().mockResolvedValue(geminiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await POSTExtraction(
        mockPost("http://localhost/api/extraction", {
          body: "2x iPhone 14 b 8500 DA Alger, رقمي 0661234567",
        }),
      );
      expect(res.status).toBe(200);
      const body = await getJson(res);
      const result = body.result as Record<string, unknown>;
      expect(result).toBeTruthy();
      // Regex should match (not Gemini) — no fetch call.
      expect(result.method).toBe("regex");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ── /api/ai/sessions/[id]/messages ─────────────────────────────────────────

describe("fix-B6: POST /api/ai/sessions/[id]/messages — consent gate", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("returns 403 consent_required when consent is unset (no Gemini call)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(geminiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      // No need to seed a real session — the consent gate fires BEFORE
      // the session lookup.
      const res = await POSTMessage(
        mockPost("http://localhost/api/ai/sessions/sess-1/messages", {
          message: "List my pending orders",
        }),
        { params: Promise.resolve({ id: "sess-1" }) },
      );
      expect(res.status).toBe(403);
      const body = await getJson(res);
      expect(body.error).toBe("consent_required");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ── /api/ai/sessions/[id]/messages/stream ──────────────────────────────────

describe("fix-B6: POST /api/ai/sessions/[id]/messages/stream — consent gate", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("returns 403 consent_required when consent is unset (no Gemini call)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(geminiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await POSTStream(
        mockPost("http://localhost/api/ai/sessions/sess-1/messages/stream", {
          message: "List my pending orders",
        }),
        { params: Promise.resolve({ id: "sess-1" }) },
      );
      expect(res.status).toBe(403);
      const body = await getJson(res as unknown as Response);
      expect(body.error).toBe("consent_required");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
