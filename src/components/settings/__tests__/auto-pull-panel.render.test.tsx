/**
 * @vitest-environment happy-dom
 */
/**
 * The seller's off switch for the scheduled pull (INT-03) - behaviour, not spelling.
 *
 * What the seller must be able to rely on: the switch shows what the server says (never a guessed
 * "on"), turning it off sends only that one switch, the screen follows the server's answer rather
 * than its own hope, a failed save puts the switch back and says so, someone who may only look
 * cannot change it, and the words are right for the courier page and the shop page and exist in
 * all three languages.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { LOCALES } from "@/lib/i18n";
import { getAutoPullCopy } from "@/lib/i18n/auto-pull";

import { AutoPullPanel } from "../auto-pull-panel";

const harness = vi.hoisted(() => ({
  locale: "en" as "en" | "fr" | "ar",
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: harness.toastError, success: harness.toastSuccess },
}));

const fetchMock = vi.fn();

function answer(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function state(courier: boolean, commerce: boolean) {
  return {
    switches: { courier, commerce },
    canManage: { courier: true, commerce: true },
  };
}

async function mount(kind: "courier" | "commerce", canManage = true) {
  const view = render(<AutoPullPanel kind={kind} canManage={canManage} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return view;
}

function sentBody(call: number): Record<string, unknown> {
  return JSON.parse(String((fetchMock.mock.calls[call]![1] as RequestInit).body));
}

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  harness.toastError.mockReset();
  harness.toastSuccess.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AutoPullPanel", () => {
  it("reads the current state from the server and shows it", async () => {
    answer(200, state(false, true));
    await mount("courier");

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/integrations/auto-pull");
  });

  it("shows the shop switch for the shop page and ignores the courier value", async () => {
    answer(200, state(false, true));
    await mount("commerce");

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  });

  it("never shows 'on' while it does not know: the switch is disabled until the server answered", async () => {
    let release: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));
    render(<AutoPullPanel kind="courier" canManage />);

    const toggle = await screen.findByRole("switch");
    expect(toggle.hasAttribute("disabled") || toggle.getAttribute("aria-disabled") === "true").toBe(true);
    expect(toggle.getAttribute("aria-checked")).not.toBe("true");

    await act(async () => {
      release(new Response(JSON.stringify(state(true, true)), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  });

  it("sends only the switch that was touched", async () => {
    answer(200, state(true, true));
    answer(200, state(false, true));
    await mount("courier");
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    await act(async () => { fireEvent.click(toggle); });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1]! as [string, RequestInit];
    expect(url).toBe("/api/integrations/auto-pull");
    expect(init.method).toBe("PUT");
    expect(sentBody(1)).toEqual({ courier: false });
  });

  it("sends the shop switch under its own key", async () => {
    answer(200, state(true, true));
    answer(200, state(true, false));
    await mount("commerce");
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    await act(async () => { fireEvent.click(toggle); });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentBody(1)).toEqual({ commerce: false });
  });

  it("follows the server's answer, not its own request", async () => {
    answer(200, state(true, true));
    // the server answers that the courier switch is still ON although we asked for off
    answer(200, state(true, true));
    await mount("courier");
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    await act(async () => { fireEvent.click(toggle); });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  });

  it("puts the switch back and says so when the save fails", async () => {
    answer(200, state(true, true));
    answer(500, { error: "boom", code: "INTERNAL" });
    await mount("courier");
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    await act(async () => { fireEvent.click(toggle); });

    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.toastError).toHaveBeenCalledWith(getAutoPullCopy("en").failed);
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  });

  it("puts the switch back when the network fails", async () => {
    answer(200, state(true, true));
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await mount("courier");
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    await act(async () => { fireEvent.click(toggle); });

    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  });

  it("confirms a good save once", async () => {
    answer(200, state(true, true));
    answer(200, state(false, true));
    await mount("courier");
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    await act(async () => { fireEvent.click(toggle); });

    await waitFor(() => expect(harness.toastSuccess).toHaveBeenCalledTimes(1));
    expect(harness.toastError).not.toHaveBeenCalled();
  });

  it("cannot be clicked twice while a save is in flight", async () => {
    answer(200, state(true, true));
    let release: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));
    await mount("courier");
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    await act(async () => { fireEvent.click(toggle); });
    await act(async () => { fireEvent.click(toggle); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      release(new Response(JSON.stringify(state(false, true)), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
  });

  it("is read-only for someone who may only look", async () => {
    answer(200, state(false, true));
    await mount("courier", false);

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(toggle.hasAttribute("disabled") || toggle.getAttribute("aria-disabled") === "true").toBe(true);

    await act(async () => { fireEvent.click(toggle); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the state cannot be read, instead of a switch that claims to be on", async () => {
    answer(500, { error: "boom" });
    answer(200, state(false, true));
    await mount("courier");

    const retry = await screen.findByRole("button", { name: getAutoPullCopy("en").retry });
    expect(screen.queryByRole("switch")).toBeNull();

    await act(async () => { fireEvent.click(retry); });

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
  });

  it("says what the courier switch does on the courier page and not what the shop one does", async () => {
    answer(200, state(true, true));
    await mount("courier");
    await screen.findByRole("switch");

    const copy = getAutoPullCopy("en");
    expect(screen.getByText(copy.courier.title)).toBeTruthy();
    expect(screen.queryByText(copy.commerce.title)).toBeNull();
  });

  it("says what the shop switch does on the shop page", async () => {
    answer(200, state(true, true));
    await mount("commerce");
    await screen.findByRole("switch");

    const copy = getAutoPullCopy("en");
    expect(screen.getByText(copy.commerce.title)).toBeTruthy();
    expect(screen.queryByText(copy.courier.title)).toBeNull();
  });

  it("shows the 'off' explanation only while the switch is off", async () => {
    answer(200, state(false, true));
    await mount("courier");
    await screen.findByRole("switch");

    const copy = getAutoPullCopy("en");
    await waitFor(() => expect(screen.getByText(copy.courier.offHint)).toBeTruthy());
    expect(screen.queryByText(copy.courier.onHint)).toBeNull();
  });

  it("shows the 'on' explanation while the switch is on", async () => {
    answer(200, state(true, true));
    await mount("courier");
    await screen.findByRole("switch");

    const copy = getAutoPullCopy("en");
    await waitFor(() => expect(screen.getByText(copy.courier.onHint)).toBeTruthy());
    expect(screen.queryByText(copy.courier.offHint)).toBeNull();
  });

  it("renders in Arabic from the Arabic copy", async () => {
    harness.locale = "ar";
    answer(200, state(true, true));
    await mount("courier");
    await screen.findByRole("switch");

    expect(screen.getByText(getAutoPullCopy("ar").courier.title)).toBeTruthy();
  });
});

describe("auto-pull copy", () => {
  it.each(LOCALES)("%s has every sentence, none empty and no placeholder left over", (locale) => {
    const copy = getAutoPullCopy(locale);
    const strings = [
      copy.failed, copy.saved, copy.retry, copy.loading, copy.readOnly,
      copy.courier.title, copy.courier.description, copy.courier.label, copy.courier.onHint, copy.courier.offHint,
      copy.commerce.title, copy.commerce.description, copy.commerce.label, copy.commerce.onHint, copy.commerce.offHint,
    ];
    for (const text of strings) {
      expect(text.trim().length).toBeGreaterThan(3);
      expect(text).not.toContain("{{");
    }
  });

  it("French and Arabic are really translated, not copies of the English", () => {
    const en = getAutoPullCopy("en");
    for (const locale of ["fr", "ar"] as const) {
      const copy = getAutoPullCopy(locale);
      expect(copy.courier.description).not.toBe(en.courier.description);
      expect(copy.commerce.description).not.toBe(en.commerce.description);
      expect(copy.failed).not.toBe(en.failed);
    }
    expect(getAutoPullCopy("ar").courier.title).toMatch(/[\u0600-\u06FF]/);
    expect(getAutoPullCopy("ar").commerce.title).toMatch(/[\u0600-\u06FF]/);
  });

  it("tells the seller the interval it really uses", () => {
    // 10 minutes is RECONCILE_INTERVAL_MS; the sentence must not drift from it.
    for (const locale of LOCALES) {
      const copy = getAutoPullCopy(locale);
      expect(copy.courier.description).toMatch(/10/);
      expect(copy.commerce.description).toMatch(/10/);
    }
  });

  it("falls back to English for an unknown locale", () => {
    expect(getAutoPullCopy("xx" as never)).toBe(getAutoPullCopy("en"));
  });
});
