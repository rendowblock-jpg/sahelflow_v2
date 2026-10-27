/**
 * @vitest-environment happy-dom
 */
/**
 * PB-WA-NOTICE: the seller is told, before the QR code or the connect button,
 * that the WhatsApp link is unofficial and that WhatsApp can restrict a number.
 *
 * Both places a seller links WhatsApp are covered: the inbox pairing dialog and
 * the onboarding pairing panel. The notice is static text: no checkbox, no
 * stored state, no request of its own.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WhatsAppPairingDialog } from "@/components/inbox/whatsapp-pairing-dialog";
import { OnboardingPairingPanel } from "@/components/onboarding/onboarding-pairing-panel";
import arJson from "@/lib/i18n/locales/ar.json";
import enJson from "@/lib/i18n/locales/en.json";
import frJson from "@/lib/i18n/locales/fr.json";
import { render, userEvent } from "@/test-utils/render";

type TestLocale = "ar" | "fr" | "en";

const harness = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));

const CATALOGS: Record<TestLocale, Record<string, string>> = {
  ar: arJson as Record<string, string>,
  fr: frJson as Record<string, string>,
  en: enJson as Record<string, string>,
};

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => CATALOGS[harness.locale][key] ?? key,
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));

const WORDING: Record<TestLocale, { title: string; body: string }> = {
  en: {
    title: "Unofficial WhatsApp connection",
    body: "SahelFlow connects to your WhatsApp the same way WhatsApp Web does. It is not the official WhatsApp Business API, and WhatsApp can restrict a number that sends bulk or automatic messages. Reply to customers who wrote to you first, and never send the same message to many people. If WhatsApp restricts your number, SahelFlow cannot lift the restriction.",
  },
  fr: {
    title: "Connexion WhatsApp non officielle",
    body: "SahelFlow se connecte à votre WhatsApp de la même façon que WhatsApp Web. Ce n'est pas l'API officielle WhatsApp Business, et WhatsApp peut restreindre un numéro qui envoie des messages en masse ou automatiques. Répondez aux clients qui vous ont écrit en premier et n'envoyez jamais le même message à beaucoup de personnes. Si WhatsApp restreint votre numéro, SahelFlow ne peut pas lever la restriction.",
  },
  ar: {
    title: "اتصال واتساب غير رسمي",
    body: "يتصل SahelFlow بواتساب الخاص بك بالطريقة نفسها التي يعمل بها واتساب ويب. هذه ليست واجهة واتساب للأعمال الرسمية، وقد يقيّد واتساب أي رقم يرسل رسائل جماعية أو آلية. ردّ على الزبائن الذين راسلوك أولاً، ولا ترسل الرسالة نفسها إلى عدد كبير من الأشخاص. إذا قيّد واتساب رقمك، فلا يستطيع SahelFlow رفع هذا التقييد.",
  },
};

const LOCALES: TestLocale[] = ["ar", "fr", "en"];

const fetchMock = vi.fn();

function sidecar(state: {
  status: string;
  hasQr: boolean;
  sidecarReachable?: boolean;
}) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/whatsapp/status")) {
      return new Response(
        JSON.stringify({ sidecarReachable: true, ...state }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  });
}

/** True when `first` comes before `second` in document order. */
function precedes(first: Node, second: Node): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function noticeIn(locale: TestLocale) {
  const { title, body } = WORDING[locale];
  const titleNode = screen.getByText(title);
  const bodyNode = screen.getByText(body);
  const notice = titleNode.closest('[data-slot="alert"]');
  expect(notice, "notice uses the shared Alert primitive").not.toBeNull();
  expect(notice).toContainElement(bodyNode);
  return notice as HTMLElement;
}

function fakeWorkspace(
  locale: TestLocale,
  status: "qr" | "disconnected",
  connectWhatsApp = vi.fn(async () => true),
) {
  return {
    locale,
    copy: (key: string) => (key === "pair" ? "Pair" : "Connect"),
    transport: { status, reachable: true },
    canManageWhatsApp: true,
    connectWhatsApp,
    qrKey: 0,
    refreshQr: vi.fn(),
  } as unknown as Parameters<typeof WhatsAppPairingDialog>[0]["workspace"];
}

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PB-WA-NOTICE copy", () => {
  it.each(LOCALES)("ships the notice title and body in %s", (locale) => {
    expect(CATALOGS[locale]["inbox.unofficialNoticeTitle"]).toBe(
      WORDING[locale].title,
    );
    expect(CATALOGS[locale]["inbox.unofficialNoticeBody"]).toBe(
      WORDING[locale].body,
    );
  });

  it.each(LOCALES)("does not promise that a number is safe in %s", (locale) => {
    const text = `${WORDING[locale].title} ${WORDING[locale].body}`;
    expect(text).not.toMatch(/no ban|never banned|sans risque|بدون حظر|آمن 100/i);
  });
});

describe("PB-WA-NOTICE onboarding pairing panel", () => {
  it.each(LOCALES)("shows the notice above the QR code in %s", async (locale) => {
    harness.locale = locale;
    sidecar({ status: "qr", hasQr: true });
    render(<OnboardingPairingPanel />);

    const qr = await screen.findByRole("img");
    const notice = noticeIn(locale);
    expect(precedes(notice, qr)).toBe(true);
    expect(within(notice).queryByRole("checkbox")).toBeNull();
  });

  it.each(LOCALES)("shows the notice above the connect button in %s", async (locale) => {
    harness.locale = locale;
    sidecar({ status: "disconnected", hasQr: false });
    const { container } = render(<OnboardingPairingPanel />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-onboarding-pairing="disconnected"]'),
      ).not.toBeNull(),
    );
    const notice = noticeIn(locale);
    const button = screen.getByRole("button");
    expect(precedes(notice, button)).toBe(true);
  });
});

describe("PB-WA-NOTICE inbox pairing dialog", () => {
  it.each(LOCALES)("shows the notice above the QR code in %s", async (locale) => {
    harness.locale = locale;
    sidecar({ status: "qr", hasQr: true });
    render(<WhatsAppPairingDialog workspace={fakeWorkspace(locale, "qr")} />);

    await userEvent.click(screen.getByRole("button", { name: "Pair" }));
    const qr = await screen.findByRole("img");
    const notice = noticeIn(locale);
    expect(precedes(notice, qr)).toBe(true);
    expect(within(notice).queryByRole("checkbox")).toBeNull();
  });

  it.each(LOCALES)("shows the notice above the retry button in %s", async (locale) => {
    harness.locale = locale;
    sidecar({ status: "disconnected", hasQr: false });
    const connectWhatsApp = vi.fn(async () => false);
    render(
      <WhatsAppPairingDialog
        workspace={fakeWorkspace(locale, "disconnected", connectWhatsApp)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(connectWhatsApp).toHaveBeenCalled());
    const notice = noticeIn(locale);
    const retry = await within(dialog).findByRole("button", {
      name: /retry|réessayer|إعادة|حاول/i,
    });
    expect(precedes(notice, retry)).toBe(true);
  });
});
