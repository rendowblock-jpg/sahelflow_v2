/**
 * @vitest-environment happy-dom
 */
/**
 * W3-A CHAIN TEST (w166). The Studio's Publish click goes through the REAL publish route function
 * (POST /api/storefront/config/[id]) over a REAL SQLite: real prepare, real photo hosting (real files, real sharp),
 * real media ledger rows, real finalize. Only the cloud is a fake (ConnectedPlatformClient) and the trust check.
 * The Studio's `fetch` is bridged to the route, so the Studio reads the route's OWN reply, never a typed body.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb } from "@/app/api/__tests__/helpers";
import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import { ConnectedPlatformHttpError } from "@/lib/connected-platform/client";
import { db, shopContext } from "@/lib/db";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { hashPhoto, shopSegment } from "@/lib/storefront/media-host";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { markLegalReviewed } from "@/lib/storefront/studio-legal";
import { render } from "@/test-utils/render";

type Loc = "ar" | "fr" | "en";
const h = vi.hoisted(() => ({
  locale: "en" as "ar" | "fr" | "en",
  client: null as unknown,
  sent: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/storefronts/sf_chain/studio",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: lookup } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      locale: h.locale,
      dir: h.locale === "ar" ? "rtl" : "ltr",
      t: (key: string, params?: Record<string, string | number>) =>
        (lookup(h.locale, key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params?.[name] ?? "")),
    }),
  };
});
vi.mock("@/components/storefront/studio/studio-canvas", () => ({
  StudioCanvas: () => <div data-testid="studio-canvas" />,
}));
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});
vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/authorization")>();
  return {
    ...actual,
    requireTrustedAction: vi.fn(async () => ({
      version: 1,
      actor: {
        kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32),
        deviceId: "7".repeat(32), sessionId: "session-chain", role: "owner", policyVersion: 1,
      },
    })),
  };
});
vi.mock("@/lib/connected-platform/runtime", () => ({
  loadStorefrontRuntime: async () => ({ client: h.client, receiptKeys: { publicKeyJwk: "k", privateKeyPkcs8: "p" } }),
}));

import { POST } from "@/app/api/storefront/config/[id]/route";
import { storefrontService } from "@/lib/storefront/service";

const SF = "sf_chain";
const ORIGIN = "https://media.example.test";
const DRAFT_AT = new Date("2026-10-30T10:00:00.000Z");
const cwd = mkdtempSync(join(tmpdir(), "w166-chain-a-"));
const SEG = shopSegment(shopContext.shopId);
mkdirSync(join(cwd, "public", "uploads", SEG), { recursive: true });
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

const tx = (loc: Loc, key: string, params: Record<string, string | number> = {}) =>
  (getRuntimeTranslation(loc, key) ?? `MISSING:${key}`).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params[name] ?? ""));

type Mode = "on" | "off" | "busy" | "refused";
function makeClient(mode: () => Mode) {
  return {
    createStorefront: vi.fn(async () => ({ storefrontId: SF, status: "active" })),
    listStorefrontReleases: vi.fn(async () => ({ storefrontId: SF, releases: [], activeAllocations: [] })),
    checkStorefrontMedia: vi.fn(async () => {
      if (mode() === "off") throw new ConnectedPlatformHttpError(503, "media_unavailable");
      return { origin: ORIGIN, widths: [640, 1280], present: [] as string[] };
    }),
    putStorefrontMedia: vi.fn(async () => {
      if (mode() === "busy") throw new TypeError("fetch failed");
      if (mode() === "refused") throw new ConnectedPlatformHttpError(403, "forbidden");
      return { status: "stored" };
    }),
    publishStorefrontRelease: vi.fn(async (_id: string, body: unknown) => {
      h.sent.push(body);
      return {
        storefrontId: SF, releaseId: (body as { releaseId: string }).releaseId, artifactDigest: "d".repeat(64),
        allocations: [], retiredAllocations: [], status: "published" as const, replay: false,
      };
    }),
  };
}

let mode: Mode = "on";
let photoHash = "";

async function seed(images: (hash: string) => string) {
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#aa5522" } }).jpeg().toBuffer();
  writeFileSync(join(cwd, "public", "uploads", SEG, "p.jpg"), bytes);
  photoHash = hashPhoto(bytes);
  const category = await db.category.create({ data: { name: "Chain" } });
  const product = await db.product.create({
    data: { name: "Chain product", price: 2500, stock: 0, categoryId: category.id, isActive: true, images: images(photoHash) },
  });
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  // An active store only goes live with legal texts the seller has read (track B2); they travel in theme.builder.legal.
  theme.builder.legal = markLegalReviewed({ sellerName: "Chain shop", registerNumber: "", returnsDays: 7, returnShipping: "seller", extraReturns: "", extraTerms: "" });
  await db.storefrontConfig.create({
    data: {
      id: SF, slug: "chain-shop", name: "Chain shop", description: "", theme: JSON.stringify(theme),
      productIds: JSON.stringify([]), isActive: true,
      draftName: "Chain shop", draftSlug: "chain-shop", draftDescription: "", draftTheme: JSON.stringify(theme),
      draftProductIds: JSON.stringify([product.id]), draftIsActive: true, draftUpdatedAt: DRAFT_AT,
    },
  });
}

type Reply = { status: number; body: Record<string, unknown> & { hostedRelease?: { releaseId: string; photos: unknown } } };
const replies: Reply[] = [];
function bridgeFetchToRoute() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "POST") return new Promise(() => undefined);
      const response = await POST(
        new NextRequest(`http://localhost${url}`, { method: "POST", headers: init?.headers as HeadersInit, body: String(init?.body ?? "") }),
        { params: Promise.resolve({ id: SF }) },
      );
      const body = (await response.json()) as Reply["body"];
      replies.push({ status: response.status, body });
      return { ok: response.status >= 200 && response.status < 300, status: response.status, json: () => Promise.resolve(body) };
    }),
  );
}

function wideViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true, writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    }),
  });
}

async function publishThroughStudio(loc: Loc) {
  h.locale = loc;
  wideViewport();
  bridgeFetchToRoute();
  const config = await storefrontService.getStudioDraftById({ prisma: db, shop: shopContext }, SF);
  if (!config) throw new Error("seeded storefront missing");
  const view = render(<StorefrontStudio config={config} products={[]} />);
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-studio-publish]") as HTMLButtonElement);
  const line = screen.getByTestId("publish-status-line");
  await waitFor(() => expect(line.textContent ?? "").not.toBe(""));
  await waitFor(() => expect(replies.length).toBeGreaterThan(0));
  return line;
}

/** No local path of any shape may leave this PC. */
function assertNoLocalPath(label: string, text: string) {
  expect(text, `${label}: file://`).not.toMatch(/file:\/\//i);
  expect(text, `${label}: drive letter`).not.toMatch(/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/);
  expect(text, `${label}: windows path`).not.toContain("\\\\");
  expect(text, `${label}: /uploads/`).not.toContain("/uploads/");
  expect(text, `${label}: /home`).not.toMatch(/\/home\b/);
  expect(text, `${label}: /Users/`).not.toContain("/Users/");
  expect(text, `${label}: tmp cwd`).not.toContain(cwd);
  expect(text, `${label}: the photo file name`).not.toContain("p.jpg");
  const user = userInfo().username;
  if (user.length >= 4) expect(text, `${label}: user name`).not.toContain(user);
}

beforeAll(async () => {
  await db.setting.count(); // connect before process.cwd is pointed at the temp folder
});
beforeEach(async () => {
  await cleanDb();
  replies.length = 0;
  h.sent.length = 0;
  mode = "on";
  h.client = makeClient(() => mode);
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Studio Publish -> real publish route -> real SQLite (photos)", () => {
  it.each(["ar", "fr", "en"] as const)("photos hosted (%s): the route says so, the ledger row is in the DB, only media-origin links leave", async (loc) => {
    await seed(() => JSON.stringify([`/uploads/${SEG}/p.jpg`, "https://own.example.test/x.jpg"]));
    const line = await publishThroughStudio(loc);
    const reply = replies[0] as Reply;
    expect(reply.status).toBe(200);
    expect(reply.body.hostedRelease?.photos).toEqual({ hosted: 1, uploaded: 1, onlyHere: 0, missing: 0, serviceOn: true });
    const releaseId = (reply.body.hostedRelease as { releaseId: string }).releaseId;
    await waitFor(() => expect(line.textContent).toBe(tx(loc, "storefront.studioStates.publish.published", { version: releaseId.slice(0, 8) })));
    expect(line.getAttribute("role")).toBe("status");
    const row = await db.setting.findUnique({ where: { key: `storefront.media.${SF}.${photoHash}` } });
    expect(row, "the media ledger row is in the real DB").not.toBeNull();
    const sent = JSON.stringify(h.sent[0]);
    expect(sent).toContain(`${ORIGIN}/m/${SF}/${photoHash}-1280.webp`);
    for (const url of sent.match(/https?:\/\/[^"\\\s]+\.webp/g) ?? []) expect(url.startsWith(`${ORIGIN}/m/`)).toBe(true);
    assertNoLocalPath("release sent (hosting on)", sent);
    assertNoLocalPath("route reply (hosting on)", JSON.stringify(reply.body));
  });

  it.each(["ar", "fr", "en"] as const)("hosting OFF (%s): published, the line says the photo stays on this PC, no path in the release or the reply", async (loc) => {
    mode = "off";
    await seed(() => JSON.stringify([`/uploads/${SEG}/p.jpg`]));
    const line = await publishThroughStudio(loc);
    const reply = replies[0] as Reply;
    expect(reply.status).toBe(200);
    expect(reply.body.hostedRelease?.photos).toEqual({ hosted: 0, uploaded: 0, onlyHere: 1, missing: 0, serviceOn: false });
    const releaseId = (reply.body.hostedRelease as { releaseId: string }).releaseId;
    await waitFor(() =>
      expect(line.textContent).toBe(
        `${tx(loc, "storefront.studioStates.publish.published", { version: releaseId.slice(0, 8) })} ${tx(loc, "storefront.photos.publishedOnlyHere", { count: 1 })}`,
      ),
    );
    const service = await db.setting.findUnique({ where: { key: "storefront.media.service" } });
    expect(JSON.parse(service?.value ?? "{}")).toMatchObject({ state: "off" });
    expect(h.sent).toHaveLength(1);
    assertNoLocalPath("release sent (hosting off)", JSON.stringify(h.sent[0]));
    assertNoLocalPath("route reply (hosting off)", JSON.stringify(reply.body));
  });

  it.each(["ar", "fr", "en"] as const)("upload fails, photo service busy (%s): the route's own 503 gives the seller the photo reason and a Retry that then publishes", async (loc) => {
    mode = "busy";
    await seed(() => JSON.stringify([`/uploads/${SEG}/p.jpg`]));
    const line = await publishThroughStudio(loc);
    const reply = replies[0] as Reply;
    expect(reply.status).toBe(503);
    expect(reply.body.code).toBe("HOSTING_BUSY");
    expect(h.sent, "nothing is sent to the cloud when a photo failed").toHaveLength(0);
    await waitFor(() => expect(line.textContent).toBe(tx(loc, "storefront.photos.fail.HOSTING_BUSY")));
    expect(line.getAttribute("role")).toBe("alert");
    expect(line.textContent).not.toContain(String(reply.body.error));
    mode = "on";
    fireEvent.click(screen.getByTestId("publish-retry"));
    await waitFor(() => expect(replies).toHaveLength(2));
    expect((replies[1] as Reply).status).toBe(200);
    await waitFor(() => expect(line.getAttribute("role")).toBe("status"));
    expect(line.textContent).toContain(tx(loc, "storefront.studioStates.publish.published", { version: "" }).trim().split(" ")[0] as string);
    expect(h.sent).toHaveLength(1);
  });

  it("upload refused (403): the refused reason, an alert, no Retry, nothing sent", async () => {
    mode = "refused";
    await seed(() => JSON.stringify([`/uploads/${SEG}/p.jpg`]));
    const line = await publishThroughStudio("ar");
    const reply = replies[0] as Reply;
    expect(reply.status).toBe(422);
    expect(reply.body.code).toBe("HOSTING_REFUSED");
    await waitFor(() => expect(line.textContent).toBe(tx("ar", "storefront.photos.fail.HOSTING_REFUSED")));
    expect(line.getAttribute("role")).toBe("alert");
    expect(screen.queryByTestId("publish-retry")).toBeNull();
    expect(h.sent).toHaveLength(0);
  });

  it.each(["ar", "fr", "en"] as const)("a photo whose FILE IS MISSING (%s): the line says so after Published, and the missing path never leaves", async (loc) => {
    await seed(() => JSON.stringify([`/uploads/${SEG}/p.jpg`, `/uploads/${SEG}/gone.jpg`]));
    const line = await publishThroughStudio(loc);
    const reply = replies[0] as Reply;
    expect(reply.status).toBe(200);
    expect(reply.body.hostedRelease?.photos).toEqual({ hosted: 1, uploaded: 1, onlyHere: 0, missing: 1, serviceOn: true });
    const releaseId = (reply.body.hostedRelease as { releaseId: string }).releaseId;
    await waitFor(() =>
      expect(line.textContent).toBe(
        `${tx(loc, "storefront.studioStates.publish.published", { version: releaseId.slice(0, 8) })} ${tx(loc, "storefront.photos.publishedMissing", { count: 1 })}`,
      ),
    );
    expect(JSON.stringify(h.sent[0])).not.toContain("gone.jpg");
  });

  it("ledger -> status route (real SQLite): the published photo is hosted, a photo added later is waiting, a gone file is missing, a pasted link is a link", async () => {
    await seed(() => JSON.stringify([`/uploads/${SEG}/p.jpg`]));
    await publishThroughStudio("en");
    expect((replies[0] as Reply).status).toBe(200);
    const other = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#2255aa" } }).jpeg().toBuffer();
    writeFileSync(join(cwd, "public", "uploads", SEG, "q.jpg"), other);
    const product = await db.product.findFirstOrThrow();
    const refs = [`/uploads/${SEG}/p.jpg`, `/uploads/${SEG}/q.jpg`, `/uploads/${SEG}/gone.jpg`, "https://own.example.test/x.jpg"];
    await db.product.update({ where: { id: product.id }, data: { images: JSON.stringify(refs) } });
    const { GET } = await import("@/app/api/storefront/media/status/route");
    const response = await GET(new NextRequest(`http://localhost/api/storefront/media/status?storefrontId=${SF}`));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { products: Record<string, Array<{ ref: string; state: string }>> };
    expect(body.products[product.id]).toEqual([
      { ref: refs[0], state: "hosted" },
      { ref: refs[1], state: "waiting" },
      { ref: refs[2], state: "missing" },
      { ref: refs[3], state: "link" },
    ]);
  });
});
