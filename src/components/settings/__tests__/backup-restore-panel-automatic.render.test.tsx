/**
 * @vitest-environment happy-dom
 */
/**
 * The seller must be able to see, in the backup panel, how old the protection
 * is: "Last automatic backup: 3 hours ago" (or "none yet"), and a visible
 * warning once the newest backup of any kind is more than 72 hours old.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatBackupAge } from "@/components/settings/backup-restore-copy";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { render } from "@/test-utils/render";

const i18n = vi.hoisted(() => ({ locale: "en" }));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: i18n.locale,
    dir: i18n.locale === "ar" ? "rtl" : "ltr",
    setLocale: vi.fn(),
    isLocalePending: false,
  }),
}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  isTauriEnv: () => true,
}));

const HOUR = 3_600_000;
const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 30, 12);

function backup(id: string, createdAtUnixMs: number) {
  return {
    backupId: id,
    createdAtUnixMs,
    verifiedAtUnixMs: createdAtUnixMs,
    retentionClass: "manual",
    pinned: false,
    workspaceId: "ws-1",
    sourceInstallationId: "inst-1",
    shopCount: 1,
    plaintextBytes: 1000,
    containerBytes: 1200,
    status: "verified",
    location: "local",
    requiresRecoveryKit: false,
    independentRecoveryReady: true,
  };
}

function serve(backups: ReturnType<typeof backup>[], lastBackupAtUnixMs: number | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        backups,
        cloudState: "available",
        automatic: { lastBackupAtUnixMs },
      }),
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  i18n.locale = "en";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("formatBackupAge", () => {
  it.each([
    [-5 * MIN, "just now"],
    [0, "just now"],
    [59_000, "just now"],
    [MIN, "1 minute ago"],
    [59 * MIN, "59 minutes ago"],
    [60 * MIN, "1 hour ago"],
    [3 * HOUR, "3 hours ago"],
    [48 * HOUR - MIN, "47 hours ago"],
    [48 * HOUR, "2 days ago"],
    [10 * 24 * HOUR, "10 days ago"],
  ])("%d ms -> %s", (delta, text) => {
    expect(formatBackupAge(delta, "en-GB", "just now")).toBe(text);
  });
});

describe("backup panel: automatic backup age", () => {
  it("shows how long ago the last automatic backup was, with no warning", async () => {
    serve([backup("b-auto", NOW - 3 * HOUR), backup("b-man", NOW - HOUR)], NOW - 3 * HOUR);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    expect(await screen.findByText("Last automatic backup: 3 hours ago")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says 'none yet' when no automatic backup exists, and does not warn about a day-old manual one", async () => {
    serve([backup("b-man", NOW - 24 * HOUR)], null);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    expect(await screen.findByText("Last automatic backup: none yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says 'none yet' with an empty list and does not invent a warning", async () => {
    serve([], null);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    expect(await screen.findByText("Last automatic backup: none yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns when the newest backup is older than 72 hours", async () => {
    serve([backup("b-old", NOW - 5 * 24 * HOUR)], NOW - 5 * 24 * HOUR);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your last backup is more than 3 days old");
    expect(alert).toHaveTextContent("5 days ago");
  });

  it("does not warn at exactly 72 hours and warns one minute later", async () => {
    serve([backup("b-72", NOW - 72 * HOUR)], null);
    const first = render(<BackupRestorePanel canRead canCreate canRestore />);
    await screen.findByText("Last automatic backup: none yet");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    first.unmount();

    serve([backup("b-72", NOW - 72 * HOUR - MIN)], null);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your last backup is more than 3 days old");
  });

  it("the newest backup of any kind counts: an old automatic one next to a fresh manual one does not warn", async () => {
    serve([backup("b-auto", NOW - 6 * 24 * HOUR), backup("b-man", NOW - 2 * HOUR)], NOW - 6 * 24 * HOUR);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    expect(await screen.findByText("Last automatic backup: 6 days ago")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders in Arabic, right to left, with Arabic words", async () => {
    i18n.locale = "ar";
    serve([backup("b-auto", NOW - 3 * HOUR)], NOW - 3 * HOUR);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    const line = await screen.findByText(/آخر نسخة احتياطية تلقائية: قبل\s*3\s*ساعات/);
    expect(line.closest("[dir]")).toHaveAttribute("dir", "rtl");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns in Arabic", async () => {
    i18n.locale = "ar";
    serve([backup("b-old", NOW - 4 * 24 * HOUR)], null);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("آخر نسخة احتياطية مضى عليها أكثر من 3 أيام");
    expect(alert.closest("[dir]")).toHaveAttribute("dir", "rtl");
  });

  it("renders in French", async () => {
    i18n.locale = "fr";
    serve([backup("b-auto", NOW - 3 * HOUR)], NOW - 3 * HOUR);
    render(<BackupRestorePanel canRead canCreate canRestore />);
    expect(await screen.findByText(/Dernière sauvegarde automatique : il y a 3 heures/)).toBeInTheDocument();
  });
});
