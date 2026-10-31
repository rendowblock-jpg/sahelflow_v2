/**
 * @vitest-environment happy-dom
 */
/**
 * The "Your phone" card: what the seller sees in ar and en for an empty shop, a pending and an
 * approved phone, an error, offline, a shop that is not connected, and the pairing and removal dialogs.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { getPhonePairingRuntimeTranslation } from "@/lib/i18n/phone-pairing-runtime";

import { PhonePairingCard } from "../phone-pairing-card";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      let text = getPhonePairingRuntimeTranslation(harness.locale, key) ?? key;
      for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value);
      return text;
    },
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));

const T = (key: string, params?: Record<string, string>) => {
  let text = getPhonePairingRuntimeTranslation(harness.locale, key) ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value);
  return text;
};

const PENDING = { deviceId: "phone_pending1", memberId: "member_owner_1", name: null, fingerprint: "A1B2-C3D4-E5F6-7788", createdAt: "2026-10-30T10:00:00.000Z", lastSeenAt: null, status: "pending", revocationEpoch: 1 };
const APPROVED = { ...PENDING, deviceId: "phone_approved1", fingerprint: "1111-2222-3333-4444", lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString(), status: "approved" };

const fetchMock = vi.fn();
let devices: unknown[] = [];
let listResponse: () => Response;
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const posts = () => fetchMock.mock.calls.filter((call) => (call[1] as { method?: string } | undefined)?.method === "POST").map((call) => String(call[0]));

beforeEach(() => {
  harness.locale = "en";
  devices = [];
  listResponse = () => json(200, { devices });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
    if ((init?.method ?? "GET") === "GET") return listResponse();
    if (url.endsWith("/pairing")) {
      devices = [PENDING];
      return json(201, { link: "https://app.sahelflow.com/#p=pair_x.token.A1B2C3D4E5F67788", code: "pair 0123 / tok / A1B2", expiresAt: new Date(Date.now() + 600_000).toISOString(), desktopFingerprint: "9999-8888-7777-6666", deviceId: PENDING.deviceId });
    }
    return json(200, { ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const RTL_UNSAFE = /\b(ml|mr|pl|pr|left|right)-|text-(left|right)\b/;

describe("PhonePairingCard states", () => {
  it.each(["en", "ar"] as const)("empty (%s): says no phone yet, offers pairing with a 44 px button, uses no left/right classes", async (locale) => {
    harness.locale = locale;
    const { container } = render(<PhonePairingCard />);
    expect(await screen.findByText(T("phones.empty.title"))).toBeInTheDocument();
    const pair = screen.getByRole("button", { name: T("phones.pair") });
    expect(pair.className).toContain("min-h-11");
    expect(container.innerHTML).not.toMatch(RTL_UNSAFE);
  });

  it.each(["en", "ar"] as const)("pending and approved (%s): fingerprint in 4 groups, status as words with an icon, remove button per row", async (locale) => {
    harness.locale = locale;
    devices = [PENDING, APPROVED];
    render(<PhonePairingCard />);
    const rows = await screen.findAllByTestId("phone-row");
    expect(rows).toHaveLength(2);
    const [pendingRow, approvedRow] = rows as [HTMLElement, HTMLElement];
    expect(within(pendingRow).getByText(T("phones.status.pending"))).toBeInTheDocument();
    expect(within(approvedRow).getByText(T("phones.status.approved"))).toBeInTheDocument();
    expect(pendingRow.querySelector("[data-status] svg")).not.toBeNull();
    expect(pendingRow.textContent).toContain("A1B2 C3D4 E5F6 7788");
    expect(within(pendingRow).getByText(T("phones.row.neverSeen"))).toBeInTheDocument();
    expect(approvedRow.textContent).not.toContain(T("phones.row.neverSeen"));
    expect(within(approvedRow).getByRole("button", { name: T("phones.remove") }).className).toContain("min-h-11");
  });

  it("error: shows a calm message, the code, and Retry loads the list", async () => {
    listResponse = () => json(500, { code: "BOOM" });
    render(<PhonePairingCard />);
    expect(await screen.findByText(T("phones.loadFailed"))).toBeInTheDocument();
    devices = [APPROVED];
    listResponse = () => json(200, { devices });
    fireEvent.click(screen.getByTestId("state-retry"));
    expect(await screen.findAllByTestId("phone-row")).toHaveLength(1);
  });

  it("offline: says so, and pairing is disabled", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<PhonePairingCard />);
    expect(await screen.findByText(T("phones.offline"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T("phones.pair") })).toBeDisabled();
  });

  it("a failed refresh after a good load keeps the list and shows the partial state", async () => {
    devices = [APPROVED];
    render(<PhonePairingCard />);
    await screen.findAllByTestId("phone-row");
    listResponse = () => json(503, { code: "PHONE_RELAY_UNAVAILABLE" });
    fireEvent.click(screen.getByRole("button", { name: T("phones.remove") }));
    fireEvent.click(await screen.findByRole("button", { name: T("phones.remove.cancel") }));
    expect(screen.getAllByTestId("phone-row")).toHaveLength(1);
  });

  it("a member (not the owner) sees nothing", async () => {
    listResponse = () => json(403, { code: "PHONE_OWNER_ONLY" });
    const { container } = render(<PhonePairingCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-testid='phone-pairing-card']")).toBeNull());
  });

  it.each([["CONNECTED_NOT_ENROLLED", 409, "phones.unavailable.notEnrolled"], ["LICENSE_FEATURE_DENIED", 403, "phones.unavailable.noLicence"]])("%s: one calm line and no pair button", async (code, status, key) => {
    listResponse = () => json(status, { code });
    render(<PhonePairingCard />);
    expect(await screen.findByText(T(key))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: T("phones.pair") })).toBeNull();
  });
});

describe("pairing dialog", () => {
  it.each(["en", "ar"] as const)("(%s) shows link, code, countdown and the sentence; focus is on Close, never on Approve; the pending phone offers both choices", async (locale) => {
    harness.locale = locale;
    render(<PhonePairingCard />);
    fireEvent.click(await screen.findByRole("button", { name: T("phones.pair") }));
    expect(await screen.findByTestId("pairing-link")).toHaveTextContent("https://app.sahelflow.com/#p=pair_x.token.A1B2C3D4E5F67788");
    expect(screen.getByTestId("pairing-link")).toHaveAttribute("dir", "ltr");
    expect(screen.getByTestId("pairing-code")).toBeInTheDocument();
    expect(screen.getByText(T("phones.dialog.instruction"))).toBeInTheDocument();
    expect(screen.getByTestId("pairing-countdown")).toHaveTextContent("10:00");
    const approve = await screen.findByRole("button", { name: T("phones.approve") });
    expect(screen.getByRole("button", { name: T("phones.reject") })).toBeInTheDocument();
    expect(within(screen.getByTestId("pairing-pending")).getByText("A1B2 C3D4 E5F6 7788")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId("pair-close"));
    expect(document.activeElement).not.toBe(approve);
    fireEvent.click(approve);
    await waitFor(() => expect(posts().some((url) => url.endsWith("/phone_pending1/approve"))).toBe(true));
  });

  it("the limit error is shown in words", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) =>
      (init?.method ?? "GET") === "GET" ? json(200, { devices: [] }) : json(409, { code: "PHONE_DEVICE_LIMIT" }));
    render(<PhonePairingCard />);
    fireEvent.click(await screen.findByRole("button", { name: T("phones.pair") }));
    expect(await screen.findByText(T("phones.error.PHONE_DEVICE_LIMIT"))).toBeInTheDocument();
  });
});

describe("removing a phone", () => {
  it.each(["en", "ar"] as const)("(%s) the confirmation says what happens, focus is on the safe button, confirming calls revoke", async (locale) => {
    harness.locale = locale;
    devices = [APPROVED];
    render(<PhonePairingCard />);
    await screen.findAllByTestId("phone-row");
    fireEvent.click(screen.getByRole("button", { name: T("phones.remove") }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(T("phones.remove.body"))).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: T("phones.remove.cancel") })));
    expect(posts()).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: T("phones.remove.confirm") }));
    await waitFor(() => expect(posts()).toEqual([`/api/connected/devices/${APPROVED.deviceId}/revoke`]));
  });
});
