/**
 * @vitest-environment happy-dom
 */
/**
 * The top-bar update chip — BEHAVIORAL evidence.
 *
 * What the seller must be able to rely on: the chip waits quietly in the bar,
 * never opens by itself, never starts a download or a restart without a click,
 * and tells the truth about where the update is.
 */
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import {
  downloadUpdate,
  installUpdate,
  retryUpdate,
} from "@/lib/updater/update-controller";
import {
  dispatchUpdate,
  resetUpdateStoreForTests,
  type UpdateAction,
} from "@/lib/updater/update-store";

import { UpdateChip } from "../update-chip";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}|${JSON.stringify(params)}` : key,
    locale: "en",
    dir: "ltr",
  }),
}));

vi.mock("@/lib/updater/update-controller", () => ({
  downloadUpdate: vi.fn(async () => undefined),
  installUpdate: vi.fn(async () => undefined),
  retryUpdate: vi.fn(async () => undefined),
}));

const OFFER: UpdateAction = {
  type: "offer",
  version: "1.0.0-internal.45",
  date: "2026-10-19",
  notes: "Internal notes for this build",
};

function drive(...actions: UpdateAction[]) {
  act(() => {
    for (const action of actions) dispatchUpdate(action);
  });
}

const chip = () => document.querySelector<HTMLButtonElement>('[data-slot="update-chip"]');

beforeEach(() => {
  resetUpdateStoreForTests();
  vi.clearAllMocks();
});

describe("UpdateChip", () => {
  it("renders nothing while there is no update", () => {
    render(<UpdateChip />);
    expect(chip()).toBeNull();
  });

  it("waits quietly in the bar when an update is offered, and never opens by itself", () => {
    render(<UpdateChip />);
    drive(OFFER);
    expect(chip()).not.toBeNull();
    expect(chip()?.dataset.phase).toBe("available");
    expect(chip()?.getAttribute("aria-label")).toContain("updater.available");
    expect(chip()?.getAttribute("aria-label")).toContain("1.0.0-internal.45");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(downloadUpdate).not.toHaveBeenCalled();
  });

  it("downloads only when the seller clicks Download, and the panel then gets out of the way", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive(OFFER);

    await user.click(chip() as HTMLElement);
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("updater.downloadHint")).toBeTruthy();

    await user.click(within(panel).getByRole("button", { name: /updater\.download$/ }));
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Later closes the panel and keeps the chip: no nagging, no download", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive(OFFER);

    await user.click(chip() as HTMLElement);
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "updater.later" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip()).not.toBeNull();
    expect(downloadUpdate).not.toHaveBeenCalled();
  });

  it("keeps the internal release notes collapsed", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive(OFFER);
    await user.click(chip() as HTMLElement);
    const panel = await screen.findByRole("dialog");
    const details = panel.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).toContain("Internal notes for this build");
  });

  it("caps very long release notes", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive({ ...OFFER, notes: "n".repeat(4000) } as UpdateAction);
    await user.click(chip() as HTMLElement);
    const panel = await screen.findByRole("dialog");
    const text = panel.querySelector("pre")?.textContent ?? "";
    expect(text.length).toBeLessThanOrEqual(1501);
    expect(text.endsWith("…")).toBe(true);
  });

  it("shows honest progress in the bar while the seller keeps working", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive(OFFER, { type: "download-started" }, { type: "progress", percent: 40 });

    expect(chip()?.dataset.phase).toBe("downloading");
    expect(chip()?.textContent).toContain("40%");
    expect(chip()?.disabled).toBe(false);

    await user.click(chip() as HTMLElement);
    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("when the download is unmeasured it shows no invented percentage", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive(OFFER, { type: "download-started" });
    expect(chip()?.textContent).toContain("updater.downloading");
    expect(chip()?.textContent).not.toContain("%");
    await user.click(chip() as HTMLElement);
    const bar = await screen.findByRole("progressbar");
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
  });

  it("asks for a restart only when the update is ready, and only a click restarts", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive(OFFER, { type: "download-started" }, { type: "download-finished" });

    expect(chip()?.dataset.phase).toBe("ready");
    expect(chip()?.textContent).toContain("updater.chip.ready");
    expect(installUpdate).not.toHaveBeenCalled();

    await user.click(chip() as HTMLElement);
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("updater.readyDesc")).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: /updater\.restartNow$/ }));
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it("is disabled while the app is closing for the installer", () => {
    render(<UpdateChip />);
    drive(
      OFFER,
      { type: "download-started" },
      { type: "download-finished" },
      { type: "install-started" },
    );
    expect(chip()?.dataset.phase).toBe("installing");
    expect(chip()?.disabled).toBe(true);
    expect(document.body.textContent).toContain("updater.installingDesc");
  });

  it("shows a failure plainly and offers Try again", async () => {
    const user = userEvent.setup();
    render(<UpdateChip />);
    drive(
      OFFER,
      { type: "download-started" },
      { type: "failed", stage: "download", message: "network down" },
    );

    expect(chip()?.dataset.phase).toBe("error");
    expect(chip()?.className).toContain("text-destructive");

    await user.click(chip() as HTMLElement);
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("updater.failedDesc")).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: "updater.retry" }));
    expect(retryUpdate).toHaveBeenCalledTimes(1);
  });

  it("disappears when the update is no longer offered", () => {
    render(<UpdateChip />);
    drive(OFFER);
    expect(chip()).not.toBeNull();
    drive({ type: "withdrawn" });
    expect(chip()).toBeNull();
  });

  it("announces its state to assistive technology without moving focus", () => {
    render(<UpdateChip />);
    drive(OFFER);
    const status = document.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("updater.available");
  });
});
