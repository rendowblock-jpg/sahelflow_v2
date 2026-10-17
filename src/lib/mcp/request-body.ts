/**
 * Bounded request-body reading for the local agent routes (S06b-08).
 *
 * `request.text()` and `request.json()` buffer the whole body before any size
 * rule can run, and `string.length` counts UTF-16 units, not bytes. These
 * helpers refuse on the declared `content-length` before reading anything, then
 * count real bytes while streaming and cancel the stream as soon as the limit
 * is crossed.
 */

/** A JSON-RPC batch longer than this is refused outright, never truncated. */
export const MCP_MAX_BATCH_SIZE = 32;

/**
 * What the reader needs from a `Request`. Structural on purpose: a real
 * `Request` satisfies it, and so does a plain object in tests.
 */
export interface BoundedBodySource {
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

export type BoundedTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" };

export function isOversizeBatch(payload: unknown): boolean {
  return Array.isArray(payload) && payload.length > MCP_MAX_BATCH_SIZE;
}

export async function readBoundedText(
  request: BoundedBodySource,
  maxBytes: number,
): Promise<BoundedTextResult> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(merged) };
}
