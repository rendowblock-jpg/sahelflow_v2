/**
 * @vitest-environment happy-dom
 */
// F-0029 (B): an outgoing message with no text and nothing to draw used to
// render an empty rounded bubble with only the time and the sent tick.
// Real code: MessageBubble. Stand-ins: the locale hook, translate functions.
// NOT covered: a real browser, the real API row.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

import { MessageBubble } from "../inbox-thread-message";
import type { InboxMessage } from "../inbox-workspace-types";

afterEach(() => cleanup());

const passthrough = ((key: string) => key) as unknown as Parameters<typeof MessageBubble>[0]["t"];

function bubble(over: Partial<InboxMessage>, locale: "ar" | "fr" | "en") {
  const message: InboxMessage = {
    id: "m-empty",
    body: "",
    direction: "outbound",
    timestamp: Date.UTC(2026, 10, 3, 18, 0, 0),
    deliveryStatus: "sent",
    ...over,
  };
  const view = render(
    <MessageBubble
      message={message}
      locale={locale}
      t={passthrough}
      copy={passthrough as unknown as Parameters<typeof MessageBubble>[0]["copy"]}
      candidate={false}
      onChooseCandidate={() => undefined}
      onRetry={() => undefined}
      onReply={() => undefined}
      canInteract={false}
      onCancelUpload={() => undefined}
    />,
  );
  const pill = view.container.querySelector("[data-message-id] > div > div") as HTMLElement;
  return { ...view, pill };
}

const UNAVAILABLE = { en: "Message could not be shown", fr: "Ce message ne peut pas être affiché", ar: "تعذّر عرض هذه الرسالة" } as const;
const PHOTO = { en: "Photo", fr: "Photo", ar: "صورة" } as const;
const VOICE = { en: "Voice message", fr: "Message vocal", ar: "رسالة صوتية" } as const;

describe("a message with nothing to draw never renders an empty pill", () => {
  for (const locale of ["en", "fr", "ar"] as const) {
    it(`${locale}: outgoing, type "text", empty body, sent (the shape the phone-sent path stores) shows a label`, () => {
      const { pill } = bubble({ messageType: "text" }, locale);
      expect(pill).not.toBeNull();
      const placeholder = pill.querySelector("[data-message-placeholder]");
      expect(placeholder, "placeholder element").not.toBeNull();
      expect(placeholder?.textContent).toContain(UNAVAILABLE[locale]);
      expect(placeholder?.className ?? "").not.toMatch(/sr-only|hidden|opacity-0/);
      expect(placeholder?.querySelector("svg")).not.toBeNull();
    });

    it(`${locale}: outgoing photo with no attachment row (phone-sent photo) shows "${PHOTO[locale]}", not an empty box`, () => {
      const { pill } = bubble({ messageType: "image" }, locale);
      const placeholder = pill.querySelector("[data-message-placeholder]");
      expect(placeholder?.textContent).toContain(PHOTO[locale]);
    });

    it(`${locale}: outgoing voice note with no attachment row shows "${VOICE[locale]}"`, () => {
      const { pill } = bubble({ messageType: "audio" }, locale);
      expect(pill.querySelector("[data-message-placeholder]")?.textContent).toContain(VOICE[locale]);
    });
  }

  it("a whitespace-only body counts as empty", () => {
    const { pill } = bubble({ messageType: "text", body: "  \n " }, "en");
    expect(pill.querySelector("[data-message-placeholder]")?.textContent).toContain(UNAVAILABLE.en);
  });

  it("an inbound message with no text gets the same placeholder", () => {
    const { pill } = bubble({ direction: "inbound", deliveryStatus: undefined, messageType: "text" }, "en");
    expect(pill.querySelector("[data-message-placeholder]")?.textContent).toContain(UNAVAILABLE.en);
  });

  it("a normal text message is unchanged: its words, no placeholder", () => {
    const { pill } = bubble({ messageType: "text", body: "Salam, ok" }, "en");
    expect(pill.textContent).toContain("Salam, ok");
    expect(pill.querySelector("[data-message-placeholder]")).toBeNull();
  });

  it("an uploading photo that has its attachment stays on the real media path (no placeholder)", () => {
    const { pill } = bubble(
      {
        messageType: "image",
        deliveryStatus: "sending",
        attachment: {
          formatVersion: 1,
          kind: "image",
          state: "ready",
          mimeType: "image/jpeg",
          fileName: "colis.jpg",
          sizeBytes: 1000,
          durationSeconds: null,
          width: null,
          height: null,
          voiceMessage: false,
          location: null,
          contact: null,
          failureCode: null,
        } as InboxMessage["attachment"],
      },
      "en",
    );
    expect(pill.querySelector("[data-message-placeholder]")).toBeNull();
  });
});
