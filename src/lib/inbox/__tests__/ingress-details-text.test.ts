// F-0027 round 2. The plain text behind "Copy details": what the seller can paste
// to support. Count, age text and the failure code of what is waiting; NEVER a
// message, a name, a phone number or a customer id. Pure function, no stand-ins.
import { describe, expect, it } from "vitest";

import type { IngressNotice } from "@/hooks/inbox/use-inbox-ingress-health";
import { buildIngressDetailsText } from "@/lib/inbox/ingress-details-text";

const FOUNDER: IngressNotice[] = [
  { kind: "waiting", count: 127, minutes: 3209, failureCode: "APP_INGRESS_TIMEOUT" },
];

const build = (locale: "en" | "fr" | "ar", over: Partial<Parameters<typeof buildIngressDetailsText>[0]> = {}) =>
  buildIngressDetailsText({ locale, notices: FOUNDER, recoveryCount: 2, checkFailed: false, ...over });

describe("buildIngressDetailsText", () => {
  it("lists count, age text, code and the recovery count, one fact per line (en)", () => {
    expect(build("en").split("\n")).toEqual([
      "SahelFlow: message reception",
      "Messages waiting: 127",
      "Oldest has waited: 2 days",
      "Reason code: APP_INGRESS_TIMEOUT",
      "Recovery issues: 2",
    ]);
  });

  it("does the same in fr", () => {
    expect(build("fr").split("\n")).toEqual([
      "SahelFlow : réception des messages",
      "Messages en attente : 127",
      "Le plus ancien attend depuis : 2 jours",
      "Code de la raison : APP_INGRESS_TIMEOUT",
      "Problèmes de récupération : 2",
    ]);
  });

  it("does the same in ar", () => {
    expect(build("ar").split("\n")).toEqual([
      "SahelFlow: استلام الرسائل",
      "رسائل تنتظر الاستلام: 127",
      "أقدمها تنتظر منذ: يومين",
      "رمز السبب: APP_INGRESS_TIMEOUT",
      "مشاكل في الاستعادة: 2",
    ]);
  });

  it("never prints the raw minute count of a long wait", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      expect(build(locale)).not.toContain("3209");
    }
  });

  it("covers every kind of notice, and leaves out what is not there", () => {
    const all: IngressNotice[] = [
      { kind: "lost", count: 3, minutes: null },
      { kind: "stalled", count: 4, minutes: null, failureCode: "HTTP_503" },
      { kind: "unreachable", count: 0, minutes: null },
      { kind: "unsupported", count: 5, minutes: null },
    ];
    const text = build("en", { notices: all, recoveryCount: 0, checkFailed: true });
    expect(text).toContain("Messages that could not be received: 3");
    expect(text).toContain("Messages stuck: 4");
    expect(text).toContain("Reason code: HTTP_503");
    expect(text).toContain("The WhatsApp helper does not answer");
    expect(text).toContain("Group messages skipped: 5");
    expect(text).toContain("Recovery check: failed");
    expect(text).not.toContain("Recovery issues");
    expect(text).not.toContain("Messages waiting");
  });

  it("a waiting notice without a code has no 'Reason code' line", () => {
    const text = build("en", { notices: [{ kind: "waiting", count: 2, minutes: 15 }], recoveryCount: 0 });
    expect(text.split("\n")).toEqual([
      "SahelFlow: message reception",
      "Messages waiting: 2",
      "Oldest has waited: 15 min",
    ]);
  });

  it("holds no message content, no phone number and no placeholder, in any language", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      const text = build(locale);
      expect(text).not.toMatch(/\{\{|undefined|null|NaN/);
      // No run of 7 or more digits (a phone number or an id); the biggest number here is 127.
      expect(text).not.toMatch(/\d{7,}/);
      expect(text).not.toMatch(/@|whatsapp\.net|\+\d/i);
      expect(text).not.toMatch(/deliver|livr[ée]|تم التسليم|سُلّمت/i);
    }
  });
});
