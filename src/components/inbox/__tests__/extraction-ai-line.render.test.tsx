/**
 * @vitest-environment happy-dom
 */
/**
 * When the AI provider's limit is reached the order card says so, and when it
 * comes back, instead of one line for every AI failure. A refused key points
 * to Settings. Any other failure keeps the old line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExtractionAiLine } from "@/components/inbox/message-extraction";
import { getOrderExtractionCopy, type OrderExtractionLocale } from "@/lib/i18n/order-extraction";
import { fireEvent, render, screen } from "@/test-utils/render";

const NOW = new Date(2026, 9, 25, 15, 30);
const at = (day: number, hour: number, min: number) => new Date(2026, 9, day, hour, min).toISOString();

function mount(locale: OrderExtractionLocale, aiFailure?: string, aiRetryAt?: string) {
  const onSettings = vi.fn();
  render(
    <ExtractionAiLine
      method="regex"
      aiFailure={aiFailure}
      aiRetryAt={aiRetryAt}
      ai={{ consent: true, available: true }}
      locale={locale}
      copy={(key, params) => getOrderExtractionCopy(locale, key, params)}
      onSettings={onSettings}
    />,
  );
  return onSettings;
}

const line = () => screen.getByRole("status");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("ExtractionAiLine: quota", () => {
  it("fr: names the limit and the time it comes back", () => {
    mount("fr", "GEMINI_QUOTA_EXHAUSTED", at(25, 18, 5));
    expect(line()).toHaveTextContent(
      "Limite de l'IA atteinte. Elle revient vers 18:05. La commande a été lue sans l'IA, vérifiez-la.",
    );
  });
  it("fr: a later day shows the date", () => {
    mount("fr", "GROQ_QUOTA_EXHAUSTED", at(26, 9, 0));
    expect(line()).toHaveTextContent(
      "Limite de l'IA atteinte. Elle revient le 26/10 09:00. La commande a été lue sans l'IA, vérifiez-la.",
    );
  });
  it("fr: no time is promised when it is unknown or already past", () => {
    for (const retry of [undefined, at(25, 14, 0), "soon"]) {
      document.body.innerHTML = "";
      mount("fr", "GEMINI_QUOTA_EXHAUSTED", retry);
      expect(line()).toHaveTextContent(
        "Limite de l'IA atteinte pour le moment. La commande a été lue sans l'IA, vérifiez-la.",
      );
      expect(line().textContent).not.toMatch(/revient/);
    }
  });
  it("en", () => {
    mount("en", "GEMINI_QUOTA_EXHAUSTED", at(25, 18, 5));
    expect(line()).toHaveTextContent(
      "The AI limit is reached. It comes back around 18:05. The order was read without the AI, please check it.",
    );
  });
  it("ar: the time stays a Latin-digit island inside the sentence", () => {
    mount("ar", "GEMINI_QUOTA_EXHAUSTED", at(25, 18, 5));
    expect(line().textContent).toBe(
      "بلغ الذكاء الاصطناعي حدّه المسموح. سيعود حوالي الساعة \u206818:05\u2069. قُرئ الطلب دون الذكاء الاصطناعي، فيُرجى مراجعته.",
    );
  });
  it("ar: no time", () => {
    mount("ar", "GROQ_QUOTA_EXHAUSTED");
    expect(line().textContent).toBe(
      "بلغ الذكاء الاصطناعي حدّه المسموح في الوقت الحالي. قُرئ الطلب دون الذكاء الاصطناعي، فيُرجى مراجعته.",
    );
  });
});

describe("ExtractionAiLine: key", () => {
  it("fr: points to Settings and the button goes there", () => {
    const onSettings = mount("fr", "GEMINI_KEY_INVALID");
    expect(line()).toHaveTextContent(
      "La clé de l'IA est refusée. Vérifiez-la dans les Paramètres. La commande a été lue sans l'IA.",
    );
    fireEvent.click(screen.getByRole("button", { name: /Paramètres IA/ }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
  it("en", () => {
    mount("en", "GROQ_KEY_INVALID");
    expect(line()).toHaveTextContent(
      "The AI key was refused. Check it in Settings. The order was read without the AI.",
    );
  });
  it("ar", () => {
    mount("ar", "GEMINI_PERMISSION_DENIED");
    expect(line().textContent).toContain(
      "رُفض مفتاح الذكاء الاصطناعي. تحقّق منه في الإعدادات. قُرئ الطلب دون الذكاء الاصطناعي.",
    );
  });
});

describe("ExtractionAiLine: any other failure", () => {
  it.each([
    ["fr", "Gemini n'a pas pu aider cette fois : voici la lecture faite sur cet appareil."],
    ["en", "Gemini could not help this time, so this is the reading made on this device."],
    ["ar", "تعذّرت مساعدة Gemini هذه المرة، وهذه هي القراءة التي تمت على هذا الجهاز."],
  ] as const)("%s keeps the generic line", (locale, text) => {
    mount(locale, "GEMINI_PROVIDER_UNAVAILABLE", at(25, 18, 5));
    expect(line().textContent).toBe(text);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ExtractionAiLine: no failure", () => {
  it("keeps the line it had before", () => {
    mount("en");
    expect(line()).toHaveTextContent("Gemini is on, but this message was clear enough to read on this device.");
  });
});

describe("order extraction copy: the new keys exist in all three languages", () => {
  const keys = ["aiQuotaAt", "aiQuotaLater", "aiQuota", "aiKeyRefused"] as const;
  it.each(keys)("%s is written for fr and ar, not left as English", (key) => {
    const en = getOrderExtractionCopy("en", key, { time: "T" });
    for (const locale of ["fr", "ar"] as const) {
      const text = getOrderExtractionCopy(locale, key, { time: "T" });
      expect(text).not.toBe(en);
      expect(text.length).toBeGreaterThan(20);
    }
  });
  it.each(["aiQuotaAt", "aiQuotaLater"] as const)("%s carries {time} in every language", (key) => {
    for (const locale of ["en", "fr", "ar"] as const) {
      expect(getOrderExtractionCopy(locale, key)).toContain("{time}");
    }
  });
  it.each(["aiQuota", "aiKeyRefused"] as const)("%s has no placeholder", (key) => {
    for (const locale of ["en", "fr", "ar"] as const) {
      expect(getOrderExtractionCopy(locale, key)).not.toMatch(/\{\w+\}/);
    }
  });
});

describe("ExtractionAiLine: which readers count as an AI read", () => {
  it.each(["gemini", "groq", "openai"] as const)("%s: the card says the AI read it", (method) => {
    render(
      <ExtractionAiLine
        method={method}
        ai={{ consent: true, available: true }}
        locale="en"
        copy={(key, params) => getOrderExtractionCopy("en", key, params)}
        onSettings={vi.fn()}
      />,
    );
    expect(line()).toHaveTextContent(getOrderExtractionCopy("en", "aiUsed"));
  });

  it("the offline reader is not an AI read", () => {
    render(
      <ExtractionAiLine
        method="regex"
        ai={{ consent: true, available: true }}
        locale="en"
        copy={(key, params) => getOrderExtractionCopy("en", key, params)}
        onSettings={vi.fn()}
      />,
    );
    expect(line()).not.toHaveTextContent(getOrderExtractionCopy("en", "aiUsed"));
  });
});

