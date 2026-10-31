/**
 * @vitest-environment happy-dom
 */
/**
 * First-run entry screens (setup, login, join) after a FAILED submit on a phone: the keyboard has closed because the
 * fields were disabled while the request ran, so focus must come back to the field that failed, the field must say
 * it is invalid, and the error text must be linked to it. Network mocked, no server.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import JoinPage from "@/app/join/page";
import LoginPage from "@/app/login/page";
import SetupPage from "@/app/setup/page";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const { getRuntimeTranslation } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string) => tables[harness.locale]?.[key] ?? getRuntimeTranslation(harness.locale, key) ?? key,
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/auth/entry-brand", () => ({ useEntryBrand: () => ({}) }));
vi.mock("@/components/runtime/runtime-ui-ready-beacon", () => ({ RuntimeUiReadyBeacon: () => null }));
vi.mock("@/components/system", () => ({
  EntryShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const fetchMock = vi.fn();

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
});

function typeInto(id: string, value: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input #${id}`);
  fireEvent.change(el, { target: { value } });
  return el;
}

describe("login: a wrong PIN", () => {
  it("returns focus to the PIN field, marks it invalid and links the error text", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/api/auth/status")
        ? reply(200, { setup: true, authenticated: false })
        : reply(401, { error: "Invalid PIN" }),
    );
    const { container } = render(<LoginPage />);
    const pin = typeInto("pin", "12345678");
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(pin));
    expect(pin).toHaveAttribute("aria-invalid", "true");
    expect(pin.getAttribute("aria-describedby")).toBe(alert.id);
    expect(alert.id).not.toBe("");
  });

  it("keeps the reveal toggle named and reachable", () => {
    fetchMock.mockResolvedValue(reply(200, { setup: true, authenticated: false }));
    render(<LoginPage />);
    const toggle = screen.getByRole("button", { name: "Show PIN" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Hide PIN/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not lose focus while typing digits (the field is one stable input)", () => {
    fetchMock.mockResolvedValue(reply(200, { setup: true, authenticated: false }));
    render(<LoginPage />);
    const pin = typeInto("pin", "1");
    pin.focus();
    for (const value of ["12", "123", "1234", "12345", "123456", "1234567", "12345678"]) {
      fireEvent.change(pin, { target: { value } });
      expect(document.activeElement).toBe(pin);
      expect(document.getElementById("pin")).toBe(pin);
    }
  });
});

describe("setup: PINs that differ", () => {
  it("focuses the confirmation field and links the mismatch text to it", async () => {
    fetchMock.mockResolvedValue(reply(200, { setup: false }));
    const { container } = render(<SetupPage />);
    typeInto("pin", "12345678");
    const confirm = typeInto("confirmPin", "12345679");
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("PINs do not match");
    await waitFor(() => expect(document.activeElement).toBe(confirm));
    expect(confirm).toHaveAttribute("aria-invalid", "true");
    expect(confirm.getAttribute("aria-describedby")).toBe(alert.id);
    expect(document.getElementById("pin")).not.toHaveAttribute("aria-invalid");
  });

  it("shows a server refusal in the seller's language, not raw English", async () => {
    harness.locale = "fr";
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/api/auth/status") ? reply(200, { setup: false }) : reply(429, { error: "Too many attempts, try later" }),
    );
    const { container } = render(<SetupPage />);
    typeInto("pin", "12345678");
    typeInto("confirmPin", "12345678");
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("Too many");
    expect(alert.textContent).toMatch(/tentatives/i);
  });
});

describe("join: an invitation that cannot be used", () => {
  function fillJoin() {
    typeInto("invite-token", "tok_expired_0001");
    typeInto("display-name", "أمينة بن علي");
    typeInto("login-id", "amina.ops");
    typeInto("member-pin", "12345678");
    return typeInto("member-pin-confirmation", "12345678");
  }

  it("says what happened and the one next step, and focuses the token field", async () => {
    fetchMock.mockResolvedValue(reply(400, { error: "Invitation is invalid or unavailable", code: "INVITATION_INVALID" }));
    const { container } = render(<JoinPage />);
    fillJoin();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This invitation can’t be used");
    expect(alert).toHaveTextContent("expired");
    expect(alert).toHaveTextContent("Ask the workspace owner for a new invitation link");
    const token = document.getElementById("invite-token") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(token));
    expect(token).toHaveAttribute("aria-invalid", "true");
    expect(token.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("tells an Arabic seller the same thing in Arabic", async () => {
    harness.locale = "ar";
    fetchMock.mockResolvedValue(reply(400, { error: "Invitation is invalid or unavailable", code: "INVITATION_INVALID" }));
    const { container } = render(<JoinPage />);
    fillJoin();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/[\u0600-\u06FF]/);
    expect(alert.textContent).not.toContain("Invitation is invalid");
  });

  it("PINs that differ focus the confirmation field before any request", async () => {
    const { container } = render(<JoinPage />);
    fillJoin();
    const confirm = typeInto("member-pin-confirmation", "87654321");
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(confirm));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
