/**
 * S06b-08: size guards must act before the body is buffered and count bytes,
 * and an oversize JSON-RPC batch must be refused rather than silently cut.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

type BodyHolder = { headers: Headers; body: ReadableStream<Uint8Array> | null };

function streamOf(chunks: Uint8Array[], onPull?: () => void, onCancel?: () => void): ReadableStream<Uint8Array> {
  let index = 0;
  // highWaterMark 0: nothing is pulled until a reader asks for it.
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        onPull?.();
        const next = chunks[index];
        index += 1;
        if (next === undefined) controller.close();
        else controller.enqueue(next);
      },
      cancel() {
        onCancel?.();
      },
    },
    { highWaterMark: 0 },
  );
}

const encoder = new TextEncoder();
const LIMIT = 256 * 1024;

async function load() {
  return import("@/lib/mcp/request-body");
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("readBoundedText", () => {
  it("refuses on the declared content-length without reading the body", async () => {
    const { readBoundedText } = await load();
    const pull = vi.fn();
    const request: BodyHolder = {
      headers: new Headers({ "content-length": String(LIMIT + 1) }),
      body: streamOf([encoder.encode("{}")], pull),
    };
    const result = await readBoundedText(request, LIMIT);
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(pull).not.toHaveBeenCalled();
  });

  it("stops reading and cancels the stream once the limit is crossed", async () => {
    const { readBoundedText } = await load();
    const chunk = new Uint8Array(64 * 1024).fill(97);
    const pull = vi.fn();
    const cancel = vi.fn();
    const request: BodyHolder = {
      headers: new Headers(),
      body: streamOf(Array.from({ length: 50 }, () => chunk), pull, cancel),
    };
    const result = await readBoundedText(request, LIMIT);
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(cancel).toHaveBeenCalled();
    expect(pull.mock.calls.length).toBeLessThan(10);
  });

  it("counts bytes, not UTF-16 units", async () => {
    const { readBoundedText } = await load();
    // 100,000 characters but 300,000 bytes: under the limit by .length, over it in bytes.
    const text = "€".repeat(100_000);
    expect(text.length).toBeLessThan(LIMIT);
    const request: BodyHolder = {
      headers: new Headers(),
      body: streamOf([encoder.encode(text)]),
    };
    expect(await readBoundedText(request, LIMIT)).toEqual({ ok: false, reason: "too_large" });
  });

  it("returns the text of a body inside the limit, multi-byte included", async () => {
    const { readBoundedText } = await load();
    const text = JSON.stringify({ q: "طلب 123 é" });
    const bytes = encoder.encode(text);
    const request: BodyHolder = {
      headers: new Headers({ "content-length": String(bytes.byteLength) }),
      body: streamOf([bytes.subarray(0, 5), bytes.subarray(5)]),
    };
    expect(await readBoundedText(request, LIMIT)).toEqual({ ok: true, text });
  });

  it("ignores a malformed content-length and still enforces the limit", async () => {
    const { readBoundedText } = await load();
    const request: BodyHolder = {
      headers: new Headers({ "content-length": "abc" }),
      body: streamOf([new Uint8Array(LIMIT + 10).fill(98)]),
    };
    expect(await readBoundedText(request, LIMIT)).toEqual({ ok: false, reason: "too_large" });
  });

  it("treats a missing body as empty text", async () => {
    const { readBoundedText } = await load();
    expect(await readBoundedText({ headers: new Headers(), body: null }, LIMIT)).toEqual({
      ok: true,
      text: "",
    });
  });
});

describe("batch size", () => {
  it("flags a batch above the cap and leaves everything else alone", async () => {
    const { MCP_MAX_BATCH_SIZE, isOversizeBatch } = await load();
    expect(MCP_MAX_BATCH_SIZE).toBe(32);
    expect(isOversizeBatch(Array.from({ length: 32 }, () => ({})))).toBe(false);
    expect(isOversizeBatch(Array.from({ length: 33 }, () => ({})))).toBe(true);
    expect(isOversizeBatch({ jsonrpc: "2.0" })).toBe(false);
    expect(isOversizeBatch(null)).toBe(false);
  });
});

describe("route wiring", () => {
  it("the MCP route reads its body through the bounded reader and no longer slices a batch", () => {
    const route = source("src/app/api/mcp/route.ts");
    expect(route).toContain("readBoundedText");
    expect(route).toContain("isOversizeBatch");
    expect(route).not.toContain("await request.text()");
    expect(route).not.toContain("slice(0, 32)");
    expect(route).not.toContain("raw.length");
  });

  it("the extraction route reads its body through the bounded reader", () => {
    const route = source("src/app/api/extraction/route.ts");
    expect(route).toContain("readBoundedText");
    expect(route).not.toContain("await req.json()");
  });
});
