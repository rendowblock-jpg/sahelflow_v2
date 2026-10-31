import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CLAIM_WINDOW,
  COOKIE_NAMES,
  DESKTOP_FILE_RE,
  FLAGSHIP_IDS,
  LOCALES,
  OUT_DIR,
  PHONE_FILE_RE,
  SCREENS,
  SCREEN_NAMES,
  VIEWPORTS,
  VIEWPORT_NAMES,
  expectedFiles,
  fileName,
  fixedClock,
  forbiddenClaims,
  localStorageValues,
  originalWidth,
  preflight,
  referenceNowProblem,
  relativeTimeWords,
  screenCookies,
} from "../e2e/support/marketing-screens-plan";

// The site is plain ESM; its modules are imported as data (same pattern as marketing-site.test.ts).
const model = (await import("../marketing/src/model.mjs")) as {
  MODULES: { shot: string | null; gallery: string[] }[];
};
const lib = (await import("../marketing/scripts/screens-lib.mjs")) as {
  SCREEN_NAMES: string[];
  SCREENS_DIR_REL: string;
  DESKTOP_ORIGINAL_RE: RegExp;
  PHONE_ORIGINAL_RE: RegExp;
};

const SRC_DIR = fileURLToPath(new URL("../marketing/src/", import.meta.url));

/** Every picture key the site itself asks for: the module shots, their galleries and the literal appWindow / screenImg keys. */
function shotKeysUsedBySite(): string[] {
  const keys = new Set<string>();
  for (const entry of model.MODULES) {
    if (entry.shot) keys.add(entry.shot);
    for (const key of entry.gallery) keys.add(key);
  }
  for (const file of readdirSync(SRC_DIR).filter((name) => name.endsWith(".mjs"))) {
    const source = readFileSync(`${SRC_DIR}${file}`, "utf8");
    for (const match of source.matchAll(/(?:appWindow|screenImg)\(\s*"([a-z]+)"/g)) keys.add(match[1] ?? "");
  }
  return [...keys].sort();
}

describe("marketing screens plan: the 15 screens", () => {
  it("are exactly the pictures the site asks for (no hard copy of the list)", () => {
    expect([...SCREEN_NAMES].sort()).toEqual(shotKeysUsedBySite());
    expect(SCREEN_NAMES).toHaveLength(15);
    expect(SCREENS.map((screen) => screen.name)).toEqual([...SCREEN_NAMES]);
  });

  it("are the same list the make-screens helpers use", () => {
    expect(lib.SCREEN_NAMES).toEqual([...SCREEN_NAMES]);
  });

  it("map to the app routes through the demo ids", () => {
    const routes = Object.fromEntries(SCREENS.map((screen) => [screen.name, screen.route(FLAGSHIP_IDS)]));
    expect(routes).toEqual({
      dashboard: "/dashboard",
      orders: "/orders",
      queue: "/orders/confirmation-queue",
      order: "/orders/demo-order-001",
      inbox: "/inbox?conversation=demo-conversation-01",
      customer: "/customers/demo-customer-01",
      delivery: "/deliveries",
      parcel: "/deliveries/demo-delivery-flagship",
      risk: "/risk",
      analytics: "/analytics",
      accounting: "/accounting",
      flow: "/automations",
      storefronts: "/storefronts",
      studio: "/storefronts/demo-storefront-01",
      team: "/settings?group=team",
    });
  });

  it("are all full-viewport shots with something to wait for", () => {
    for (const screen of SCREENS) {
      expect(screen.fullViewport, screen.name).toBe(true);
      expect(screen.waitFor.length, screen.name).toBeGreaterThan(0);
    }
  });
});

describe("marketing screens plan: sizes, languages, cookies", () => {
  it("shoots the desktop at 1600x1000 and the phone at 390x844 with dpr 2", () => {
    expect(VIEWPORTS.desktop).toEqual({ name: "desktop", width: 1600, height: 1000, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    expect(VIEWPORTS.phone).toEqual({ name: "phone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    expect([...VIEWPORT_NAMES]).toEqual(["desktop", "phone"]);
    expect(originalWidth("desktop")).toBe(1600);
    expect(originalWidth("phone")).toBe(780);
  });

  it("covers Arabic, French and English", () => {
    expect([...LOCALES]).toEqual(["ar", "fr", "en"]);
  });

  it("uses the LIGHT Carnet look with the cookie names the app reads", () => {
    expect(COOKIE_NAMES).toEqual({
      locale: "sahelflow-locale",
      theme: "sahelflow-theme",
      preset: "sahelflow-theme-preset",
      look: "sahelflow-look",
    });
    for (const locale of LOCALES) {
      const cookies = screenCookies(locale, "http://localhost:4440");
      const byName = Object.fromEntries(cookies.map((cookie) => [cookie.name, cookie.value]));
      expect(byName, locale).toEqual({
        "sahelflow-locale": locale,
        "sahelflow-theme": "light",
        "sahelflow-theme-preset": "carnet",
        "sahelflow-look": "2",
      });
      expect(cookies.every((cookie) => cookie.url === "http://localhost:4440"), locale).toBe(true);
      expect(JSON.stringify(cookies) + JSON.stringify(localStorageValues(locale))).not.toMatch(/dark|night/i);
      expect(localStorageValues(locale)).toEqual({
        theme: "light",
        "sahelflow-theme-preset": "carnet",
        "sahelflow-look": "2",
        "sahelflow-locale": locale,
      });
    }
  });

  it("freezes the browser clock at 10:00 of the demo day (a full timestamp wins)", () => {
    expect(fixedClock("2026-10-28")).toBe("2026-10-28T10:00:00");
    expect(fixedClock("2026-10-28T08:15:00")).toBe("2026-10-28T08:15:00");
  });
});

describe("marketing screens plan: file names", () => {
  it("names a desktop picture <name>-<locale>.webp and a phone picture <name>-phone-<locale>.webp", () => {
    expect(fileName("orders", "ar", "desktop")).toBe("orders-ar.webp");
    expect(fileName("orders", "fr", "phone")).toBe("orders-phone-fr.webp");
    expect(fileName("studio", "en", "phone")).toBe("studio-phone-en.webp");
    expect(fileName("dashboard", "en", "desktop")).toBe("dashboard-en.webp");
  });

  it("expects 15 x 3 x 2 = 90 distinct originals, each matching exactly one make-screens regex", () => {
    const files = expectedFiles();
    expect(files).toHaveLength(90);
    expect(new Set(files).size).toBe(90);
    const desktop = files.filter((file) => lib.DESKTOP_ORIGINAL_RE.test(file));
    const phone = files.filter((file) => lib.PHONE_ORIGINAL_RE.test(file));
    expect(desktop).toHaveLength(45);
    expect(phone).toHaveLength(45);
    expect(desktop.filter((file) => lib.PHONE_ORIGINAL_RE.test(file))).toEqual([]);
    for (const file of files) expect(DESKTOP_FILE_RE.test(file) !== PHONE_FILE_RE.test(file), file).toBe(true);
    expect(DESKTOP_FILE_RE.source).toBe(lib.DESKTOP_ORIGINAL_RE.source);
    expect(PHONE_FILE_RE.source).toBe(lib.PHONE_ORIGINAL_RE.source);
  });

  it("writes into the folder the site and make-screens read", () => {
    expect(OUT_DIR).toBe("marketing/static/img/screens");
    expect(OUT_DIR).toBe(lib.SCREENS_DIR_REL);
    expect(existsSync(fileURLToPath(new URL(`../${OUT_DIR}`, import.meta.url)))).toBe(true);
  });
});

describe("marketing screens plan: preflight", () => {
  const good = { referenceNow: "2026-10-28", customerIds: ["demo-customer-01", "demo-customer-02"], orderIds: ["demo-order-001"], ids: FLAGSHIP_IDS };

  it("accepts demo ids with a frozen clock", () => {
    expect(preflight(good)).toEqual({ ok: true, problems: [] });
  });

  it("rejects any customer or order id without the demo- prefix", () => {
    const customer = preflight({ ...good, customerIds: ["demo-customer-01", "cus_8841"] });
    expect(customer.ok).toBe(false);
    expect(customer.problems.join("\n")).toContain("cus_8841");
    const order = preflight({ ...good, orderIds: ["ord_77", "demo-order-001"] });
    expect(order.ok).toBe(false);
    expect(order.problems.join("\n")).toContain("ord_77");
    for (const bad of ["xdemo-1", "my-demo-1", "DEMO-1", "demo-", ""]) {
      expect(preflight({ ...good, orderIds: [bad] }).ok, bad).toBe(false);
    }
  });

  it("rejects a flagship id that is not a demo id", () => {
    expect(preflight({ ...good, ids: { ...FLAGSHIP_IDS, storefrontId: "store-1" } }).ok).toBe(false);
  });

  it("rejects an empty workspace (nothing proves it is the demo)", () => {
    expect(preflight({ ...good, customerIds: [] }).ok).toBe(false);
    expect(preflight({ ...good, orderIds: [] }).ok).toBe(false);
  });

  it("rejects a missing or malformed SF_DEMO_REFERENCE_NOW", () => {
    for (const missing of [undefined, "", "   "]) {
      const result = preflight({ ...good, referenceNow: missing });
      expect(result.ok, String(missing)).toBe(false);
      expect(result.problems.join("\n")).toContain("SF_DEMO_REFERENCE_NOW");
    }
    expect(referenceNowProblem("yesterday")).not.toBeNull();
    expect(referenceNowProblem("2026-13-45")).not.toBeNull();
    expect(referenceNowProblem("2026-10-28")).toBeNull();
    expect(referenceNowProblem("2026-10-28T08:15:00Z")).toBeNull();
  });
});

describe("marketing screens plan: relative times follow the server clock and are listed", () => {
  it("finds French, English and Arabic relative times", () => {
    expect(relativeTimeWords("Dernier message il y a 3 min")).toEqual(["il y a 3 min"]);
    expect(relativeTimeWords("Last message 3 min ago")).toEqual(["3 min ago"]);
    expect(relativeTimeWords("آخر رسالة منذ 3 دقائق")).toEqual(["منذ 3 دقائق"]);
    expect(relativeTimeWords("منذ ٣ دقائق")).toEqual(["منذ ٣ دقائق"]);
    expect(relativeTimeWords("منذ ساعتين")).toEqual(["منذ ساعتين"]);
    expect(relativeTimeWords("il y a une heure et il y a 2 jours")).toEqual(["il y a une heure", "il y a 2 jours"]);
    expect(relativeTimeWords("2 hours ago")).toEqual(["2 hours ago"]);
    expect(relativeTimeWords("just now")).toEqual(["just now"]);
    expect(relativeTimeWords("à l'instant")).toEqual(["à l'instant"]);
    expect(relativeTimeWords("Hier")).toEqual(["Hier"]);
    expect(relativeTimeWords("Yesterday")).toEqual(["Yesterday"]);
    expect(relativeTimeWords("أمس")).toEqual(["أمس"]);
  });

  it("leaves fixed dates and ordinary words alone", () => {
    expect(relativeTimeWords("28 Oct 2026 10:00, Chicago, hiérarchie, 12 000 DA")).toEqual([]);
    expect(relativeTimeWords("")).toEqual([]);
  });
});

describe("marketing screens plan: forbidden claims (never imply a live courier or a live WhatsApp)", () => {
  const flagged: [string, string][] = [
    ["WhatsApp connected", "connected"],
    ["WhatsApp connecté", "connecté"],
    ["Connecté à WhatsApp", "Connecté"],
    ["Yalidine en ligne", "en ligne"],
    ["ZR Express: online now", "online now"],
    ["Live tracking with Yalidine", "Live"],
    ["Suivi en direct Maystro", "en direct"],
    ["واتساب متصل", "متصل"],
    ["تتبع مباشر مع ياليدين", "مباشر"],
    ["Courier live", "live"],
  ];
  for (const [text, state] of flagged) {
    it(`flags "${text}"`, () => {
      const claims = forbiddenClaims(text);
      expect(claims.length).toBeGreaterThan(0);
      expect(claims[0]?.state).toBe(state);
    });
  }

  it("lets the demo caption and plain labels through", () => {
    expect(forbiddenClaims("Demo data: sample shop, no live account")).toEqual([]);
    expect(forbiddenClaims("Données de démonstration : boutique d'exemple, aucun compte réel")).toEqual([]);
    expect(forbiddenClaims("بيانات تجريبية: متجر نموذجي، لا حساب حقيقي")).toEqual([]);
    expect(forbiddenClaims("WhatsApp conversation (demo)")).toEqual([]);
    expect(forbiddenClaims("Orders delivered, yalidine parcel in transit")).toEqual([]);
    expect(forbiddenClaims("")).toEqual([]);
  });

  it("only flags a state word that stands next to the name", () => {
    const far = `WhatsApp ${"x".repeat(CLAIM_WINDOW + 20)} connected`;
    expect(forbiddenClaims(far)).toEqual([]);
    const near = `WhatsApp ${"x".repeat(10)} connected`;
    expect(forbiddenClaims(near)).toHaveLength(1);
  });
});
