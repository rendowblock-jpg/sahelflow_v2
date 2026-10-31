/**
 * @vitest-environment happy-dom
 */
/**
 * Release history: the five states, and a rollback that names the version and
 * never claims success before the server said so.
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StorefrontReleaseHistory } from "@/components/storefront/studio/storefront-release-history";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}|${JSON.stringify(params)}` : key,
    locale: "en",
    dir: "ltr",
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const live = {
  releaseId: "rel_2",
  parentReleaseId: "rel_1",
  templateId: "atlas",
  locale: "ar",
  artifactDigest: "a1b2c3d4e5f60718293a",
  createdAt: "2026-10-29T14:05:00.000Z",
  isActive: true,
  catalog: [
    { itemKey: "p1", unitPriceDzd: 2500 },
    { itemKey: "p2", unitPriceDzd: 4800 },
  ],
};
const older = {
  ...live,
  releaseId: "rel_1",
  parentReleaseId: null,
  templateId: "sahara",
  artifactDigest: "9f8e7d6c5b4a39281706",
  createdAt: "2026-10-20T09:30:00.000Z",
  isActive: false,
};

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const history = (releases: unknown[], connected = true) =>
  reply({ history: { storefrontId: "sf1", releases }, connected });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () => render(<StorefrontReleaseHistory storefrontId="sf1" />);

describe("StorefrontReleaseHistory states", () => {
  it("shows a card-shaped skeleton while the first load is pending", () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    mount();
    const loading = screen.getByTestId("release-history-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading.querySelectorAll("[data-skeleton-card]").length).toBeGreaterThan(1);
    expect(screen.queryByTestId("state-retry")).toBeNull();
  });

  it("first load failure: says what failed, offers Retry, and Retry reloads", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(history([live, older]));
    mount();
    const error = await screen.findByTestId("release-history-error");
    expect(error.textContent).toContain("storefront.studioStates.history.loadFailedTitle");
    expect(error.textContent).toContain("storefront.studioStates.history.loadFailedBody");
    fireEvent.click(screen.getByTestId("state-retry"));
    expect(await screen.findByTestId("release-card-rel_2")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("release-history-error")).toBeNull();
  });

  it("empty history: says what it is and offers the Studio as the next action", async () => {
    fetchMock.mockResolvedValueOnce(history([]));
    mount();
    const empty = await screen.findByTestId("release-history-empty");
    const link = within(empty).getByRole("link");
    expect(link).toHaveAttribute("href", "/storefronts/sf1/studio");
  });

  it("a store that is not published online says so instead of 'no versions'", async () => {
    fetchMock.mockResolvedValueOnce(history([], false));
    mount();
    const state = await screen.findByTestId("release-history-not-connected");
    expect(state.textContent).toContain("storefront.studioStates.history.notConnectedBody");
    expect(screen.queryByTestId("release-history-empty")).toBeNull();
  });

  it("a failed refresh keeps the releases on screen and shows the partial banner with Refresh", async () => {
    fetchMock.mockResolvedValueOnce(history([live, older])).mockRejectedValueOnce(new Error("offline"));
    mount();
    await screen.findByTestId("release-card-rel_2");
    fireEvent.click(screen.getByTestId("release-history-refresh"));
    expect(await screen.findByTestId("release-history-stale")).toBeInTheDocument();
    expect(screen.getByTestId("release-card-rel_2")).toBeInTheDocument();
    expect(screen.getByTestId("release-card-rel_1")).toBeInTheDocument();
    expect(screen.queryByTestId("release-history-error")).toBeNull();
  });
});

describe("StorefrontReleaseHistory rollback", () => {
  async function openRollback() {
    fetchMock.mockResolvedValueOnce(history([live, older]));
    mount();
    await screen.findByTestId("release-card-rel_1");
    fireEvent.click(screen.getByTestId("release-rollback-rel_1"));
    return screen.findByRole("alertdialog");
  }

  it("asks first, names the version, and sends nothing until confirmed", async () => {
    const dialog = await openRollback();
    expect(dialog.textContent).toContain("sahara");
    expect(dialog.textContent).toContain("9f8e7d6c5b4a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("release-card-rel_2")?.textContent).toContain(
      "storefront.releaseHistory.current",
    );
  });

  it("cancel closes the dialog without calling the server", async () => {
    const dialog = await openRollback();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "storefront.studioStates.history.rollbackCancel" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("confirm posts the chosen release and the release that is live now", async () => {
    const dialog = await openRollback();
    fetchMock.mockResolvedValueOnce(reply({})).mockResolvedValueOnce(history([older, live]));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "storefront.studioStates.history.rollbackConfirm" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1] as [string, { method: string; body: string }];
    expect(url).toBe("/api/storefront/config/sf1/releases");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      sourceReleaseId: "rel_1",
      expectedActiveReleaseId: "rel_2",
    });
    expect(await screen.findByText("storefront.releaseHistory.rolledBack")).toBeInTheDocument();
  });

  it("a failed rollback keeps the live version, says so, and never says it worked", async () => {
    const dialog = await openRollback();
    fetchMock.mockResolvedValueOnce(reply({ error: "boom" }, 500));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "storefront.studioStates.history.rollbackConfirm" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("storefront.studioStates.history.rollbackFailed");
    expect(screen.queryByText("storefront.releaseHistory.rolledBack")).toBeNull();
    expect(screen.getByTestId("release-card-rel_2").textContent).toContain(
      "storefront.releaseHistory.current",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a conflict (the live version moved) says so and reloads the history", async () => {
    const dialog = await openRollback();
    fetchMock
      .mockResolvedValueOnce(reply({ error: "release_conflict" }, 409))
      .mockResolvedValueOnce(history([older, live]));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "storefront.studioStates.history.rollbackConfirm" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("storefront.studioStates.history.rollbackConflict");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
  it("a lost connection during rollback claims neither outcome and reloads to check", async () => {
    const dialog = await openRollback();
    fetchMock.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(history([live, older]));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "storefront.studioStates.history.rollbackConfirm" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("storefront.studioStates.history.rollbackUnknown");
    expect(screen.queryByText("storefront.releaseHistory.rolledBack")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
