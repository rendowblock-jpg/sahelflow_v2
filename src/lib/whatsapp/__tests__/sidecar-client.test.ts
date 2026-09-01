import { beforeEach, describe, expect, it, vi } from "vitest";

const { TEST_TOKEN, TEST_URL } = vi.hoisted(() => ({
  TEST_TOKEN: "test-sidecar-token-abcdef-0123456789",
  TEST_URL: "http://test-sidecar.local",
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      whatsappSidecarUrl: TEST_URL,
      sidecarToken: TEST_TOKEN,
      sidecarTokenFile: "/nonexistent/token-file",
    },
  };
});

import { verifySidecarWebSocketGrant } from "../../../../sidecars/whatsapp/auth-tokens";
import {
  sidecar,
  SidecarRequestError,
  SidecarUnavailableError,
} from "../sidecar-client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const REQUEST_BINDING = "ab".repeat(32);
const EFFECT_KEY = `wa:${"11".repeat(16)}:${"22".repeat(32)}:text:id`;
const VIDEO_EFFECT_KEY = `wa:${"11".repeat(16)}:${"22".repeat(32)}:video:id`;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("WhatsApp sidecar client", () => {
  it("uses the private REST token for server-to-sidecar requests", async () => {
    fetchMock.mockResolvedValue(response(200, { status: "connected" }));
    await sidecar.status();
    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_URL}/status`,
      expect.objectContaining({
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      }),
    );
    expect(sidecar.restToken()).toBe(TEST_TOKEN);
  });

  it("issues a short-lived signed grant with an explicit renewal boundary", () => {
    const subject = "authenticated-owner:test-session";
    const bundle = sidecar.wsGrantBundle(subject);
    expect(bundle?.token).toBeTruthy();
    expect(bundle?.token).not.toBe(TEST_TOKEN);
    expect(bundle?.expiresAt).toBeGreaterThan(Date.now());
    expect(verifySidecarWebSocketGrant(bundle!.token, TEST_TOKEN)).toMatchObject({
      subject,
      expiresAt: bundle!.expiresAt,
    });
  });

  it("sends a request-bound durable effect", async () => {
    fetchMock.mockResolvedValue(
      response(200, { ok: true, id: "WA-1", status: "sent" }),
    );
    await expect(
      sidecar.send("213555000111", "Hello", EFFECT_KEY, REQUEST_BINDING),
    ).resolves.toEqual({ ok: true, id: "WA-1", status: "sent" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({
        to: "213555000111",
        text: "Hello",
        effectKey: EFFECT_KEY,
        requestBinding: REQUEST_BINDING,
      }),
    );
  });

  it("sends staged video bytes as bounded multipart rather than base64", async () => {
    fetchMock.mockResolvedValue(
      response(200, { ok: true, id: "WA-VIDEO-1", status: "sent" }),
    );
    const bytes = Buffer.from("video-bytes", "utf8");

    await expect(
      sidecar.sendVideo(
        "213555000111",
        bytes,
        "video/mp4",
        "Demo",
        VIDEO_EFFECT_KEY,
        REQUEST_BINDING,
      ),
    ).resolves.toEqual({ ok: true, id: "WA-VIDEO-1", status: "sent" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TEST_URL}/send-video`);
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("to")).toBe("213555000111");
    expect(form.get("effectKey")).toBe(VIDEO_EFFECT_KEY);
    expect(form.get("requestBinding")).toBe(REQUEST_BINDING);
    expect(form.get("caption")).toBe("Demo");
    // The declared media type rides an explicit form field — sidecar
    // multipart parsing can drop the file-part Content-Type (campaign B3).
    expect(form.get("mimeType")).toBe("video/mp4");
    const video = form.get("video");
    expect(video).toBeInstanceOf(Blob);
    expect((video as Blob).type).toBe("video/mp4");
  });

  it("declares the sniffed media type as an explicit form field for document and voice sends", async () => {
    fetchMock.mockResolvedValue(
      response(200, { ok: true, id: "WA-DOC-1", status: "sent" }),
    );
    await sidecar.sendDocument(
      "213555000111",
      Buffer.from("doc-bytes", "utf8"),
      "application/pdf",
      "facture.pdf",
      "",
      EFFECT_KEY,
      REQUEST_BINDING,
    );
    const [documentUrl, documentInit] = fetchMock.mock.calls.at(
      -1,
    ) as [string, RequestInit];
    expect(documentUrl).toBe(`${TEST_URL}/send-document`);
    expect((documentInit.body as FormData).get("mimeType")).toBe(
      "application/pdf",
    );

    fetchMock.mockResolvedValue(
      response(200, { ok: true, id: "WA-VOICE-1", status: "sent" }),
    );
    await sidecar.sendVoice(
      "213555000111",
      Buffer.from("ogg-bytes", "utf8"),
      "audio/ogg",
      true,
      12,
      EFFECT_KEY,
      REQUEST_BINDING,
    );
    const [voiceUrl, voiceInit] = fetchMock.mock.calls.at(
      -1,
    ) as [string, RequestInit];
    expect(voiceUrl).toBe(`${TEST_URL}/send-voice`);
    expect((voiceInit.body as FormData).get("mimeType")).toBe("audio/ogg");
  });

  it("reads a durable receipt without invoking another provider send", async () => {
    fetchMock.mockResolvedValue(
      response(200, { receipt: { id: "WA-1", status: "sent" } }),
    );
    await expect(
      sidecar.receipt(EFFECT_KEY, REQUEST_BINDING),
    ).resolves.toEqual({ ok: true, id: "WA-1", status: "sent" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TEST_URL}/send-receipt`);
    expect(init.method).toBe("POST");
  });

  it("returns null when the receipt journal confirms no receipt", async () => {
    fetchMock.mockResolvedValue(response(200, { receipt: null }));
    await expect(sidecar.receipt(EFFECT_KEY, REQUEST_BINDING)).resolves.toBeNull();
  });

  it("preserves retryability and ambiguity returned by the sidecar", async () => {
    fetchMock.mockResolvedValue(
      response(503, {
        error: "not connected",
        code: "WHATSAPP_NOT_CONNECTED",
        retryable: true,
        ambiguous: false,
      }),
    );
    const error = await sidecar
      .send("213555000111", "Hello", EFFECT_KEY, REQUEST_BINDING)
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(SidecarRequestError);
    expect(error).toMatchObject({
      code: "WHATSAPP_NOT_CONNECTED",
      retryable: true,
      ambiguous: false,
      status: 503,
    });
  });

  it("carries the sidecar's named failing condition (campaign B3 round 3)", async () => {
    fetchMock.mockResolvedValue(
      response(400, {
        error: "Invalid durable document send request",
        code: "INVALID_DOCUMENT_SEND_REQUEST",
        reason: "file_name",
        retryable: false,
        ambiguous: false,
      }),
    );
    const error = await sidecar
      .sendDocument(
        "213555000111",
        Buffer.from("probe"),
        "application/pdf",
        "contract.pdf",
        "",
        EFFECT_KEY,
        REQUEST_BINDING,
      )
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(SidecarRequestError);
    expect(error).toMatchObject({
      code: "INVALID_DOCUMENT_SEND_REQUEST",
      reason: "file_name",
      retryable: false,
      ambiguous: false,
      status: 400,
    });
  });

  it("keeps a null reason when the sidecar response has none", async () => {
    fetchMock.mockResolvedValue(
      response(400, { error: "bad request", code: "SOMETHING_ELSE" }),
    );
    const error = await sidecar
      .send("213555000111", "Hello", EFFECT_KEY, REQUEST_BINDING)
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(SidecarRequestError);
    expect(error).toMatchObject({ code: "SOMETHING_ELSE", reason: null });
  });

  it("classifies connection refusal as safely retryable before submit", async () => {
    const error = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    fetchMock.mockRejectedValue(error);
    const caught = await sidecar.status().catch((failure) => failure);
    expect(caught).toBeInstanceOf(SidecarUnavailableError);
    expect(caught).toMatchObject({ ambiguous: false });
  });

  it("classifies timeout as ambiguous because a send may have committed", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
    const pending = sidecar.status().catch((failure) => failure);
    await vi.advanceTimersByTimeAsync(8_000);
    const caught = await pending;
    expect(caught).toBeInstanceOf(SidecarUnavailableError);
    expect(caught).toMatchObject({ ambiguous: true });
    vi.useRealTimers();
  });

  it("keeps the media timeout active until the response body is consumed", async () => {
    vi.useFakeTimers();
    const request = { signal: null as AbortSignal | null };
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      request.signal = init.signal ?? null;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener("abort", () => {
            controller.error(
              Object.assign(new Error("aborted"), { name: "AbortError" }),
            );
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });

    const media = await sidecar.downloadMedia({} as never);
    expect(request.signal?.aborted).toBe(false);
    const pendingRead = media.body!.getReader().read().catch((error) => error);
    await vi.advanceTimersByTimeAsync(120_000);
    const caught = await pendingRead;
    expect(request.signal?.aborted).toBe(true);
    expect(caught).toBeInstanceOf(SidecarUnavailableError);
    expect(caught).toMatchObject({ ambiguous: true });
    vi.useRealTimers();
  });
});
