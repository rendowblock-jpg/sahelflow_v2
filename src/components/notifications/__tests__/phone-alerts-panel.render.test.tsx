/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@/test-utils/render";
import { PhoneAlertsPanel } from "../phone-alerts-panel";

vi.mock("@/hooks/use-i18n", async () => {
  const { makeEnglishT } = await import("./i18n-mock");
  return { useI18n: () => ({ t: makeEnglishT(), locale: "en", dir: "ltr" }) };
});

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const status = (over: Record<string, unknown> = {}) => ({
  phones: [{ id: "p1", label: "Phone" }, { id: "p2", label: "Tablet" }], enabled: true, pcOnline: true, pcLastOnlineAt: null, ...over,
});

describe("Phone alerts panel", () => {
  it("renders nothing while the switch is off (the default)", () => {
    const fetchImpl = ok(status());
    const { container } = render(<PhoneAlertsPanel fetchImpl={fetchImpl} />);
    expect(container.textContent).toBe("");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("loading shows a skeleton that announces itself", () => {
    const never = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    render(<PhoneAlertsPanel available fetchImpl={never} />);
    expect(screen.getByTestId("phone-alerts-skeleton").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Alerts only come while SahelFlow is open on your PC.")).toBeTruthy();
  });
  it("empty says no phone is linked", async () => {
    render(<PhoneAlertsPanel available fetchImpl={ok(status({ phones: [] }))} />);
    expect(await screen.findByText("No phone is linked yet.")).toBeTruthy();
  });
  it("ready counts phones and says when the PC has not been online", async () => {
    render(<PhoneAlertsPanel available fetchImpl={ok(status({ pcOnline: false, pcLastOnlineAt: "2026-10-31T13:05:00Z" }))} />);
    expect(await screen.findByText(/2 phones linked/)).toBeTruthy();
    expect((await screen.findByTestId("phone-alerts-stale")).textContent).toBe("Your PC has not been online since 14:05. Alerts resume when it is on.");
  });
  it("error offers a 44 px Retry that recovers", async () => {
    const calls = vi.fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(new Response(JSON.stringify(status()), { status: 200 }));
    render(<PhoneAlertsPanel available fetchImpl={calls as unknown as typeof fetch} />);
    expect((await screen.findByRole("alert")).textContent).toBe("We could not load your phone alerts.");
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    expect(await screen.findByText(/2 phones linked/)).toBeTruthy();
  });
  it("error over stale data keeps the last data on screen", async () => {
    const calls = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(status()), { status: 200 }))
      .mockResolvedValue(new Response("nope", { status: 500 }));
    const { rerender } = render(<PhoneAlertsPanel available fetchImpl={calls as unknown as typeof fetch} refreshToken={0} />);
    expect(await screen.findByText(/2 phones linked/)).toBeTruthy();
    rerender(<PhoneAlertsPanel available fetchImpl={calls as unknown as typeof fetch} refreshToken={1} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("We could not refresh. Showing what we had."));
    expect(screen.getByText(/2 phones linked/)).toBeTruthy();
  });
});
