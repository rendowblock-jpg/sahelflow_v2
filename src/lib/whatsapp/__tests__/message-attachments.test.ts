import { describe, expect, it } from "vitest";

import {
  extractWhatsAppMessageAttachment,
  openWhatsAppMessageAttachmentWithKey,
  projectWhatsAppMessageAttachmentForContactAccess,
  sealWhatsAppMessageAttachmentWithKey,
} from "../message-attachments";

describe("WhatsApp protected attachment metadata", () => {
  it("keeps bounded image metadata and excludes provider retrieval authority", () => {
    const attachment = extractWhatsAppMessageAttachment({
      imageMessage: {
        mimetype: "image/jpeg",
        fileName: "../../customer-photo.jpg",
        fileLength: "2048",
        width: 640,
        height: 480,
        url: "https://provider.invalid/private",
        directPath: "/private/provider/path",
        mediaKey: "secret-provider-key",
      },
    });

    expect(attachment).toMatchObject({
      kind: "image",
      state: "metadata-only",
      mimeType: "image/jpeg",
      fileName: "customer-photo.jpg",
      sizeBytes: 2048,
      width: 640,
      height: 480,
      failureCode: null,
    });
    expect(JSON.stringify(attachment)).not.toContain("provider.invalid");
    expect(JSON.stringify(attachment)).not.toContain("provider/path");
    expect(JSON.stringify(attachment)).not.toContain("secret-provider-key");
  });

  it("rejects unsafe declared media size and MIME without opening bytes", () => {
    expect(
      extractWhatsAppMessageAttachment({
        stickerMessage: {
          mimetype: "image/webp",
          fileLength: 4 * 1024 * 1024 + 1,
        },
      }),
    ).toMatchObject({ state: "rejected", failureCode: "DECLARED_SIZE_LIMIT" });

    expect(
      extractWhatsAppMessageAttachment({
        documentMessage: {
          mimetype: "application/x-msdownload",
          fileName: "payload.exe",
          fileLength: 4096,
        },
      }),
    ).toMatchObject({ state: "rejected", failureCode: "UNSUPPORTED_MIME_TYPE" });
  });

  it("retains validated location and contact content as structured metadata", () => {
    expect(
      extractWhatsAppMessageAttachment({
        locationMessage: {
          degreesLatitude: 36.7538,
          degreesLongitude: 3.0588,
          name: "Alger Centre",
          address: "Alger",
          url: "javascript:alert(1)",
        },
      }),
    ).toMatchObject({
      kind: "location",
      state: "ready",
      location: {
        latitude: 36.7538,
        longitude: 3.0588,
        name: "Alger Centre",
      },
    });

    expect(
      extractWhatsAppMessageAttachment({
        contactMessage: {
          displayName: "Client Test",
          vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:Client Test\nEND:VCARD",
        },
      }),
    ).toMatchObject({
      kind: "contact",
      state: "ready",
      contact: { displayName: "Client Test" },
    });
  });

  it("redacts structured contact and location values without contact authority", () => {
    const location = extractWhatsAppMessageAttachment({
      locationMessage: {
        degreesLatitude: 36.7538,
        degreesLongitude: 3.0588,
        name: "Client address",
        address: "Alger",
      },
    });
    const contact = extractWhatsAppMessageAttachment({
      contactMessage: {
        displayName: "Client Test",
        vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:Client Test\nEND:VCARD",
      },
    });

    expect(
      projectWhatsAppMessageAttachmentForContactAccess(location, false),
    ).toMatchObject({
      kind: "location",
      state: "metadata-only",
      location: null,
      contact: null,
    });
    expect(
      projectWhatsAppMessageAttachmentForContactAccess(contact, false),
    ).toMatchObject({
      kind: "contact",
      state: "metadata-only",
      fileName: null,
      sizeBytes: null,
      contact: null,
    });
    expect(
      projectWhatsAppMessageAttachmentForContactAccess(contact, true),
    ).toEqual(contact);
  });

  it("authenticates attachment metadata to the canonical Message identity", () => {
    const key = Buffer.alloc(32, 7);
    const attachment = extractWhatsAppMessageAttachment({
      audioMessage: {
        mimetype: "audio/ogg",
        fileLength: 8192,
        seconds: 12,
        ptt: true,
      },
    });
    expect(attachment).not.toBeNull();

    const sealed = sealWhatsAppMessageAttachmentWithKey(
      "message-a",
      attachment!,
      key,
    );
    expect(sealed).not.toContain("audio/ogg");
    expect(
      openWhatsAppMessageAttachmentWithKey("message-a", sealed, key),
    ).toEqual(attachment);
    expect(() =>
      openWhatsAppMessageAttachmentWithKey("message-b", sealed, key),
    ).toThrow();
  });
});
