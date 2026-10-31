/**
 * @vitest-environment happy-dom
 */
/**
 * The chip while the update backs up the shop first: five states, announced
 * once to screen readers, in Arabic and English, without the chip changing.
 */
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import {
  dispatchUpdate,
  resetUpdateStoreForTests,
  type UpdateAction,
} from "@/lib/updater/update-store";

import { UpdateChip } from "../update-chip";

const h = vi.hoisted(() => ({ locale: "en" as "en" | "ar" | "fr" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// The real runtime copy for the backup keys; any other key is echoed back.
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) =>
        (getRuntimeTranslation(h.locale, key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
          String(params?.[name] ?? ""),
        ),
      locale: h.locale,
      dir: h.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});

vi.mock("@/lib/updater/update-controller", () => ({
  downloadUpdate: vi.fn(async () => undefined),
  installUpdate: vi.fn(async () => undefined),
  retryUpdate: vi.fn(async () => undefined),
}));

const OFFER: UpdateAction = { type: "offer", version: "1.0.1", date: null, notes: null };

function drive(...actions: UpdateAction[]) {
  act(() => {
    for (const action of actions) dispatchUpdate(action);
  });
}

const chip = () => document.querySelector<HTMLButtonElement>('[data-slot="update-chip"]');
const statuses = () => document.querySelectorAll('[role="status"]');

type State = "running" | "done" | "skipped" | "failed" | "timed-out";
const STEPS: Array<[State, UpdateAction]> = [
  ["running", { type: "backup-phase", phase: "running" }],
  ["done", { type: "backup-phase", phase: "done" }],
  ["skipped", { type: "backup-phase", phase: "skipped", ageMinutes: 12 }],
  ["failed", { type: "backup-phase", phase: "failed" }],
  ["timed-out", { type: "backup-phase", phase: "timed-out" }],
];

const EN: Record<State, string> = {
  running: "Backing up your shop first",
  done: "Backup done. Installing the update.",
  skipped: "A backup from 12 min ago is recent enough. Installing the update.",
  failed: "Backup failed. Updating anyway, your data is not touched by the update.",
  "timed-out": "The backup is taking too long. Updating anyway, your data is not touched by the update.",
};
const AR: Record<State, RegExp> = {
  running: /نسخة احتياطية.*أولاً/,
  done: /تم حفظ النسخة الاحتياطية/,
  skipped: /قبل 12 د/,
  failed: /تعذّر.*على أي حال/,
  "timed-out": /وقتًا طويلًا.*على أي حال/,
};

function toInstalling() {
  drive(OFFER, { type: "download-started" }, { type: "download-finished" }, { type: "install-started" });
}

beforeEach(() => {
  resetUpdateStoreForTests();
  h.locale = "en";
});

describe.each(["en", "ar"] as const)("update chip, backup first (%s)", (locale) => {
  it.each(STEPS)("%s: said once, in words, and the chip stays the same element", (state, action) => {
    h.locale = locale;
    render(<UpdateChip />);
    toInstalling();
    const before = chip();
    expect(before).not.toBeNull();
    // Walk the real order of events up to the state under test.
    if (state === "running") drive(action);
    else drive({ type: "backup-phase", phase: "running" }, action);

    expect(statuses()).toHaveLength(1);
    const text = statuses()[0]?.textContent ?? "";
    if (locale === "en") expect(text).toBe(EN[state]);
    else expect(text).toMatch(AR[state]);
    expect(text).not.toContain("{{");
    expect(statuses()[0]?.getAttribute("aria-live")).toBe("polite");

    expect(chip()).toBe(before);
    expect(chip()?.getAttribute("data-phase")).toBe("installing");
    expect(chip()?.getAttribute("data-backup")).toBe(state);
  });

  it("the short label says what is happening only while the backup runs", () => {
    h.locale = locale;
    render(<UpdateChip />);
    toInstalling();
    drive({ type: "backup-phase", phase: "running" });
    const running = chip()?.textContent ?? "";
    drive({ type: "backup-phase", phase: "done" });
    const done = chip()?.textContent ?? "";
    expect(running).not.toBe(done);
    expect(done).toContain("updater.chip.installing");
  });
});

describe("update chip without a backup step", () => {
  it("a plain install still announces the installing text", () => {
    render(<UpdateChip />);
    toInstalling();
    expect(statuses()[0]?.textContent).toBe("updater.installingDesc");
    expect(chip()?.hasAttribute("data-backup")).toBe(false);
  });

  it("a backup event before the install is ignored and says nothing", () => {
    render(<UpdateChip />);
    drive(OFFER, { type: "download-started" }, { type: "download-finished" });
    drive({ type: "backup-phase", phase: "running" });
    expect(chip()?.getAttribute("data-phase")).toBe("ready");
    expect(chip()?.hasAttribute("data-backup")).toBe(false);
    expect(statuses()[0]?.textContent ?? "").not.toContain("Backing up");
  });
});
