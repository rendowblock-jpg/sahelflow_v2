/**
 * Gemini consent-gate integration tests.
 *
 * Authentication is established first, then the tests prove customer PII never
 * reaches Gemini until the seller explicitly enables consent.
 */
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
} from "@/app/api/__tests__/helpers";

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

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieJar.get,
    set: cookieJar.set,
    delete: cookieJar.delete,
  })),
}));

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { createSession, setupAuth } from "@/lib/auth/server";
import { POST as POSTExtraction } from "@/app/api/extraction/route";
import { POST as POSTMessage } from "@/app/api/ai/sessions/[id]/messages/route";
import { POST as POSTStream } from "@/app/api/ai/sessions/[id]/messages/stream/route";

async function setConsent(value: boolean): Promise<void> {
  await rawDb.setting.upsert({
    where: { key: "gemini_consent_accepted" },
    update: { value: String(value) },
    create: { key: "gemini_consent_accepted", value: String(value) },
  });
}

function geminiOkResponse(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(async () => {
  cookieJar.reset();
  await cleanDb();
  await setupAuth("12345678");
  await createSession("127.0.0.1");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

describe("POST /api/extraction — consent gate", () => {
  it("returns 403 consent_required when the setting is unset without a Gemini call", async () => {
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
      expect(body.message).toMatch(/Settings/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns 403 consent_required when consent is explicitly false", async () => {
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
      expect((await getJson(res)).error).toBe("consent_required");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("proceeds past consent when enabled and uses regex without Gemini", async () => {
    await setConsent(true);
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
      expect(result.method).toBe("regex");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("POST /api/ai/sessions/[id]/messages — consent gate", () => {
  it("returns 403 consent_required after authentication when consent is unset", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(geminiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await POSTMessage(
        mockPost("http://localhost/api/ai/sessions/sess-1/messages", {
          message: "List my pending orders",
        }),
        { params: Promise.resolve({ id: "sess-1" }) },
      );
      expect(res.status).toBe(403);
      expect((await getJson(res)).error).toBe("consent_required");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("POST /api/ai/sessions/[id]/messages/stream — consent gate", () => {
  it("returns 403 consent_required after authentication when consent is unset", async () => {
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
