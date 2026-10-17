import { beforeEach, describe, expect, it, vi } from "vitest";

// S09b-01: GET /api/search must hand the request's own AbortSignal to the
// search, so a search the browser already cancelled stops early on the server.

const mocks = vi.hoisted(() => ({
  searchUniversalRecords: vi.fn(),
  warmUniversalSearchRecords: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: class extends Response {
    static override json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
    }
  },
}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: <T>(handler: T) => handler,
}));
vi.mock("@/lib/search/universal-search-server", () => ({
  searchUniversalRecords: mocks.searchUniversalRecords,
  warmUniversalSearchRecords: mocks.warmUniversalSearchRecords,
}));

import { GET, POST } from "../route";

function request(url: string, signal: AbortSignal) {
  return { nextUrl: new URL(url), signal } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  mocks.searchUniversalRecords.mockReset();
  mocks.warmUniversalSearchRecords.mockReset();
  mocks.searchUniversalRecords.mockResolvedValue({
    query: "amina",
    results: [],
    degradedFamilies: [],
    tookMs: 7,
  });
  mocks.warmUniversalSearchRecords.mockResolvedValue(undefined);
});

describe("GET /api/search", () => {
  it("hands the request's own AbortSignal to the search", async () => {
    const controller = new AbortController();

    const response = await GET(
      request("http://localhost/api/search?q=amina&limit=5", controller.signal),
    );

    expect(mocks.searchUniversalRecords).toHaveBeenCalledTimes(1);
    const [query, limit, signal] = mocks.searchUniversalRecords.mock.calls[0]!;
    expect(query).toBe("amina");
    expect(limit).toBe(5);
    expect(signal).toBe(controller.signal);
    expect(response.headers.get("Server-Timing")).toBe("search;dur=7");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("still clamps the query and defaults the limit", async () => {
    const controller = new AbortController();
    await GET(
      request(`http://localhost/api/search?q=${"a".repeat(400)}`, controller.signal),
    );

    const [query, limit, signal] = mocks.searchUniversalRecords.mock.calls[0]!;
    expect((query as string).length).toBe(160);
    expect(limit).toBe(16);
    expect(signal).toBe(controller.signal);
  });
});

describe("POST /api/search", () => {
  it("keeps warming the projection with no search and no body", async () => {
    const response = await POST();

    expect(mocks.warmUniversalSearchRecords).toHaveBeenCalledTimes(1);
    expect(mocks.searchUniversalRecords).not.toHaveBeenCalled();
    expect(response.status).toBe(204);
  });
});
