import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WhatsApp media async authentication contract", () => {
  it("keeps full integrity verification off the synchronous request loop", () => {
    const mediaObject = source("src/lib/whatsapp/media-object-provenance.ts");

    expect(mediaObject).toContain('from "node:fs/promises"');
    expect(mediaObject).toContain("webcrypto.subtle.decrypt");
    expect(mediaObject).toContain("await descriptor.read(");
    expect(mediaObject).toContain("await yieldToEventLoop()");
    expect(mediaObject).toContain('OBJECT_CHUNK_BYTES = 1024 * 1024');
    expect(mediaObject).toContain("plaintextHash.update(plaintext)");
    expect(mediaObject).toContain("ciphertextHash.update(ciphertext)");
    expect(mediaObject).not.toContain("readSync(");
    expect(mediaObject).not.toContain("openSync(");
    expect(mediaObject).not.toContain("createDecipheriv");
  });

  it("cancels abandoned range authentication at bounded frame boundaries", () => {
    const route = source("src/app/api/inbox/media/[id]/route.ts");
    const service = source("src/lib/whatsapp/media-read-service.ts");
    const mediaObject = source("src/lib/whatsapp/media-object-provenance.ts");

    expect(route).toContain("request.signal");
    expect(service).toContain("signal?: AbortSignal");
    expect(service).toContain("WhatsAppMediaReadAbortedError");
    expect(service).toContain('"WHATSAPP_MEDIA_REQUEST_ABORTED"');
    expect(service).toContain("readWhatsAppMediaObject(");
    expect(mediaObject).toContain("WhatsAppMediaReadAbortedError");
    expect(mediaObject).toContain("function throwIfAborted");
    expect(mediaObject).toContain("throwIfAborted(signal)");
    expect(mediaObject).toContain("signal?: AbortSignal");
    expect(mediaObject).toContain("await descriptor.read(");
    expect(mediaObject).toContain("await webcrypto.subtle.decrypt(");
  });
});
