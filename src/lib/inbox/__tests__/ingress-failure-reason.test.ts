// F-0027 round 2 / F-0024. The WhatsApp service reports the failure code of the
// OLDEST stuck message (payload.ingress.spool.lastFailureCode). The inbox now
// turns it into ONE plain sentence for a shop owner, in ar / fr / en. Pure
// functions and the copy file, no stand-ins. Rules for the sentences: say what
// the seller can do; never say a message is lost; never say "delivered".
import { describe, expect, it } from "vitest";

import {
  KNOWN_FAILURE_CODES,
  failureReasonKey,
  failureReasonText,
  parseFailureCode,
} from "@/lib/inbox/ingress-failure-reason";

const LOCALES = ["en", "fr", "ar"] as const;

describe("parseFailureCode: only a short token is ever shown", () => {
  it("keeps well-formed codes, known or not", () => {
    for (const code of [
      "APP_INGRESS_TIMEOUT",
      "HTTP_503",
      "HTTP_401",
      "SOMETHING_NEW_FROM_A_LATER_VERSION",
      "ECONNRESET",
      "a.b:c-d_9",
    ]) {
      expect(parseFailureCode(code)).toBe(code);
    }
  });

  it("drops anything that is not a short token, so no content or number can leak through", () => {
    for (const bad of [
      null,
      undefined,
      "",
      42,
      {},
      [],
      true,
      "has space",
      "+213 791 99 91 57",
      "hello\nworld",
      "<script>",
      "x".repeat(129),
    ]) {
      expect(parseFailureCode(bad)).toBeNull();
    }
    expect(parseFailureCode("x".repeat(128))).toBe("x".repeat(128));
  });
});

describe("failureReasonKey: which sentence a code gets", () => {
  it("maps each known code to its own sentence", () => {
    expect(KNOWN_FAILURE_CODES).toEqual([
      "APP_INGRESS_TIMEOUT",
      "APP_INGRESS_UNAVAILABLE",
      "HTTP_401",
      "REQUEST_VALIDATION_FAILED",
      "INGRESS_PROCESSING_PENDING",
      "WHATSAPP_ACCOUNT_UNAVAILABLE",
      "WHATSAPP_ACCOUNT_MISMATCH",
      "CONFLICT",
      "LEASE_EXPIRED",
    ]);
    for (const code of KNOWN_FAILURE_CODES) {
      expect(failureReasonKey(code)).toBe(`inboxHealth.why.${code}`);
    }
  });

  it("any other HTTP_<n> shares one 'the app answered with an error' sentence", () => {
    for (const code of ["HTTP_500", "HTTP_503", "HTTP_404", "HTTP_429"]) {
      expect(failureReasonKey(code)).toBe("inboxHealth.why.http");
    }
    expect(failureReasonKey("HTTP_")).toBe("inboxHealth.why.generic");
    expect(failureReasonKey("HTTP_ABC")).toBe("inboxHealth.why.generic");
  });

  it("every other string still works and gets the generic sentence", () => {
    for (const code of ["ATTEMPT_BUDGET_EXHAUSTED", "ECONNRESET", "SOMETHING_NEW", "app_ingress_timeout"]) {
      expect(failureReasonKey(code)).toBe("inboxHealth.why.generic");
    }
  });
});

describe("failureReasonText: the sentence a shop owner reads", () => {
  const CODES = [...KNOWN_FAILURE_CODES, "HTTP_503", "SOMETHING_NEW"];

  for (const locale of LOCALES) {
    it(`has a real sentence for every code in ${locale}`, () => {
      for (const code of CODES) {
        const text = failureReasonText(locale, code);
        expect(text.length, `${locale} ${code}`).toBeGreaterThan(30);
        expect(text).not.toMatch(/\{\{|inboxHealth/);
        // A sentence, not a code dump.
        expect(text).not.toContain(code);
      }
    });

    it(`gives each known code its own sentence in ${locale}`, () => {
      const sentences = [...KNOWN_FAILURE_CODES, "HTTP_503", "SOMETHING_NEW"].map((code) =>
        failureReasonText(locale, code),
      );
      expect(new Set(sentences).size).toBe(sentences.length);
    });

    it(`never says a message is lost or delivered, in ${locale}`, () => {
      for (const code of CODES) {
        const text = failureReasonText(locale, code);
        expect(text, `${locale} ${code}`).not.toMatch(
          /\blost\b|\bdeliver|\bperdu|\blivr[ée]|ضاع|ضائع|فُقد|فقدت|فُقدت|تم التسليم|سُلّمت|تم تسليم/i,
        );
      }
    });

    it(`says what the seller can do in ${locale}`, () => {
      // wait / restart / reconnect / contact support, in that language.
      const DO: Record<(typeof LOCALES)[number], RegExp> = {
        en: /wait|restart|reconnect|contact|check|link/i,
        fr: /patientez|attendez|redémarrez|reconnect|contactez|vérifiez|reliez/i,
        ar: /انتظر|أعد تشغيل|أعد الاتصال|تواصل|تحقق|اربط/,
      };
      for (const code of CODES) {
        expect(failureReasonText(locale, code), `${locale} ${code}`).toMatch(DO[locale]);
      }
    });
  }

  it("names the cause in plain words for the cases the Founder will meet", () => {
    expect(failureReasonText("en", "APP_INGRESS_TIMEOUT")).toMatch(/too long/i);
    expect(failureReasonText("en", "APP_INGRESS_UNAVAILABLE")).toMatch(/could not reach/i);
    expect(failureReasonText("en", "HTTP_401")).toMatch(/private key/i);
    expect(failureReasonText("en", "WHATSAPP_ACCOUNT_MISMATCH")).toMatch(/different WhatsApp number/i);
    expect(failureReasonText("fr", "APP_INGRESS_TIMEOUT")).toMatch(/trop de temps/i);
    expect(failureReasonText("fr", "HTTP_401")).toMatch(/clé privée/i);
    expect(failureReasonText("ar", "APP_INGRESS_TIMEOUT")).toMatch(/وقتاً طويلاً/);
    expect(failureReasonText("ar", "HTTP_401")).toMatch(/المفتاح الخاص/);
  });
});
