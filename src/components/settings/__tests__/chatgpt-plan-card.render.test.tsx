/**
 * @vitest-environment happy-dom
 */
/**
 * "Use your ChatGPT plan" card - behaviour in en, fr and ar (rtl), with the routes, the clock and the
 * window opener mocked (no network, no real timer).
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { ChatGptPlanCard } from "../chatgpt-plan-card";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar", theme: "light" as "light" | "dark" }));

vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  return {
    useI18n: () => ({
      t: (key: string) => tables[harness.locale]?.[key] ?? key,
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: harness.theme }) }));

const AUTH_URL = "https://auth.openai.com/api/accounts/authorize?client_id=app_X&state=SECRETSTATE123";
const ATTEMPT = "attempt_ABC12345";
const USAGE_URL = "https://chatgpt.com/settings/usage";
const WELCOME_FLAG = "sahelflow-chatgpt-welcome-seen";

type Account = { id: number; email: string | null; planUsageEnabled: boolean; signedIn: boolean; active: boolean };
const amina: Account = { id: 1, email: "amina@example.dz", planUsageEnabled: true, signedIn: true, active: true };
const karim: Account = { id: 2, email: "karim@example.dz", planUsageEnabled: true, signedIn: true, active: false };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn();
const openMock = vi.fn();
let accounts: Account[] = [];
let statusQueue: Array<Record<string, unknown>> = [{ state: "pending" }];
let signIn: () => Response = () => json({ ok: true, url: AUTH_URL, attemptId: ATTEMPT });
let accountsResponse: (() => Response) | null = null;

const calls = (prefix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix));
const statusCalls = () => calls("/api/ai/openai/sign-in/status").length;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await vi.advanceTimersByTimeAsync(0);
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function mount(props: { canManage?: boolean } = {}) {
  const view = render(<ChatGptPlanCard canManage={props.canManage ?? true} />);
  await flush();
  return view;
}
async function startSignIn(label = "Continue with ChatGPT") {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.locale = "en";
  harness.theme = "light";
  accounts = [];
  statusQueue = [{ state: "pending" }];
  signIn = () => json({ ok: true, url: AUTH_URL, attemptId: ATTEMPT });
  accountsResponse = null;
  window.localStorage.clear();
  fetchMock.mockReset();
  openMock.mockReset().mockReturnValue(null);
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/ai/openai/accounts") return accountsResponse ? accountsResponse() : json({ ok: true, accounts });
    if (url === "/api/ai/openai/sign-in" && method === "POST") return signIn();
    if (url.startsWith("/api/ai/openai/sign-in/status?attempt=")) {
      const next = statusQueue.length > 1 ? statusQueue.shift()! : statusQueue[0];
      return json({ ok: true, ...next });
    }
    if (/^\/api\/ai\/openai\/accounts\/\d+\/activate$/.test(url) && method === "POST") return json({ ok: true });
    if (/^\/api\/ai\/openai\/accounts\/\d+$/.test(url) && method === "DELETE") return json({ ok: true, revokedRemotely: true });
    if (url === "/api/auth/reauthenticate" && method === "POST") return json({ ok: true });
    throw new Error(`unexpected request ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  // The sign-in page is opened by clicking a real <a target=_blank> (the desktop shell only catches that), so watch those clicks.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    openMock(this.href, this.target, this.rel);
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  { locale: "en" as const, signInLabel: "Continue with ChatGPT", dir: "ltr" },
  { locale: "fr" as const, signInLabel: "Continuer avec ChatGPT", dir: "ltr" },
  { locale: "ar" as const, signInLabel: "المتابعة عبر ChatGPT", dir: "rtl" },
])("(a) not signed in - $locale", ({ locale, signInLabel, dir }) => {
  beforeEach(() => {
    harness.locale = locale;
  });

  it("shows the title, one short paragraph, the honest disclosure and the official button", async () => {
    const { container } = await mount();
    expect(container.querySelector("[dir]")?.getAttribute("dir")).toBe(dir);
    expect(screen.getByRole("heading", { name: /ChatGPT/ })).toBeInTheDocument();
    const button = screen.getByRole("button", { name: signInLabel });
    expect(button).toHaveAttribute("type", "button");
    const disclosure = screen.getByText(/OpenAI/);
    expect(disclosure.textContent).toContain("ChatGPT");
    // Light theme: black button, white logo. Decorative logo: the label carries the name.
    const logo = button.querySelector("img")!;
    expect(logo).toHaveAttribute("src", "/brand/chatgpt/chatgpt-logo-white.svg");
    expect(logo).toHaveAttribute("alt", "");
    expect(logo).toHaveAttribute("width", "21");
    expect(logo).toHaveAttribute("height", "21");
    expect(button.className).not.toMatch(/rotate|scale-x|flip/);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(calls("/api/ai/openai/sign-in")).toHaveLength(0);
  });
});

describe("(a) the button follows the theme", () => {
  it("uses the white logo on a black button in the light theme, the black logo on a bordered white button in the dark theme", async () => {
    const light = await mount();
    const lightButton = screen.getByRole("button", { name: "Continue with ChatGPT" });
    expect(lightButton.querySelector("img")).toHaveAttribute("src", "/brand/chatgpt/chatgpt-logo-white.svg");
    expect(lightButton.className).toContain("bg-black");
    expect(lightButton.className).toContain("text-white");
    light.unmount();
    harness.theme = "dark";
    await mount();
    const darkButton = screen.getByRole("button", { name: "Continue with ChatGPT" });
    expect(darkButton.querySelector("img")).toHaveAttribute("src", "/brand/chatgpt/chatgpt-logo-black.svg");
    expect(darkButton.className).toContain("bg-white");
    expect(darkButton.className).toContain("text-black");
    expect(darkButton.className).toMatch(/\bborder\b/);
  });
});

describe("(b) waiting", () => {
  it("opens the address from the route in the system browser, never writes it into the page, and says what to do", async () => {
    const { container } = await mount();
    await startSignIn();
    expect(calls("/api/ai/openai/sign-in")[0]).toEqual(["/api/ai/openai/sign-in", expect.objectContaining({ method: "POST" })]);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith(AUTH_URL, "_blank", "noopener noreferrer");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Finish in your browser");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    for (const secret of ["SECRETSTATE123", "auth.openai.com", ATTEMPT, "client_id"]) {
      expect(container.innerHTML).not.toContain(secret);
    }
  });

  it("lets the seller open the page again with a button (the address stays out of the page)", async () => {
    await mount();
    await startSignIn();
    fireEvent.click(screen.getByRole("button", { name: "Open the page again" }));
    expect(openMock).toHaveBeenCalledTimes(2);
    expect(openMock).toHaveBeenLastCalledWith(AUTH_URL, "_blank", "noopener noreferrer");
  });

  it("refuses an address that is not an OpenAI https address and does not wait", async () => {
    signIn = () => json({ ok: true, url: "http://evil.example/steal", attemptId: ATTEMPT });
    await mount();
    await startSignIn();
    expect(openMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(statusCalls()).toBe(0);
  });

  it("polls the status every 2 seconds with the attempt id, and stops at success", async () => {
    await mount();
    await startSignIn();
    expect(statusCalls()).toBe(0);
    await advance(2000);
    expect(statusCalls()).toBe(1);
    expect(String(calls("/api/ai/openai/sign-in/status")[0]![0])).toBe(`/api/ai/openai/sign-in/status?attempt=${ATTEMPT}`);
    await advance(4000);
    expect(statusCalls()).toBe(3);
    accounts = [amina];
    statusQueue = [{ state: "done", summary: { accountId: 1, email: amina.email, plan: "plus", workspace: "Amina Shop", planUsageEnabled: true } }];
    await advance(2000);
    const after = statusCalls();
    await advance(60_000);
    expect(statusCalls()).toBe(after);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByText("amina@example.dz")).toBeInTheDocument();
  });

  it("stops polling when the seller cancels, and goes back to the sign-in button", async () => {
    await mount();
    await startSignIn();
    await advance(2000);
    const before = statusCalls();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flush();
    await advance(60_000);
    expect(statusCalls()).toBe(before);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue with ChatGPT" })).toBeInTheDocument();
  });

  it("gives up after 10 minutes, says it timed out, and stops asking", async () => {
    await mount();
    await startSignIn();
    await advance(599_000);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await advance(2000);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("This took too long. Please try again.");
    const after = statusCalls();
    expect(after).toBeLessThanOrEqual(300);
    await advance(120_000);
    expect(statusCalls()).toBe(after);
    expect(screen.getByRole("button", { name: "Continue with ChatGPT" })).toBeInTheDocument();
  });

  it("leaves no timer behind when the card is removed while waiting", async () => {
    const { unmount } = await mount();
    await startSignIn();
    await advance(2000);
    const before = statusCalls();
    unmount();
    await advance(700_000);
    expect(statusCalls()).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("(c) signed in", () => {
  it("lists the accounts, marks the active one, and offers use, sign out, add another and the usage link", async () => {
    accounts = [amina, karim];
    await mount();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("amina@example.dz")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("In use")).toBeInTheDocument();
    expect(within(rows[0]!).queryByRole("button", { name: /Use this account/ })).toBeNull();
    expect(within(rows[1]!).queryByText("In use")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with ChatGPT" })).toBeNull();
    const usage = screen.getByRole("link", { name: "Manage usage in ChatGPT" });
    expect(usage).toHaveAttribute("href", USAGE_URL);
    expect(usage).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(usage).toHaveAttribute("target", "_blank");

    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Use this account (karim@example.dz)" }));
    await flush();
    expect(calls("/api/ai/openai/accounts/2/activate")[0]![1]).toEqual(expect.objectContaining({ method: "POST" }));

    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Sign out (karim@example.dz)" }));
    await flush();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/ai/openai/accounts/2" && init?.method === "DELETE")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add another account" }));
    await flush();
    expect(JSON.parse(String((calls("/api/ai/openai/sign-in")[0]![1] as RequestInit).body))).toEqual({});
    expect(screen.getByRole("status")).toHaveTextContent("Finish in your browser");
  });

  it("shows the plan and workspace of the account that just signed in, and the welcome message once", async () => {
    await mount();
    await startSignIn();
    accounts = [amina];
    statusQueue = [{ state: "done", summary: { accountId: 1, email: amina.email, plan: "plus", workspace: "Amina Shop", planUsageEnabled: true } }];
    await advance(2000);
    const welcome = screen.getByRole("status");
    expect(welcome).toHaveTextContent(
      "You're using your ChatGPT plan. Eligible requests in SahelFlow use your plan; you can manage usage in ChatGPT settings.",
    );
    expect(screen.getByText("plus")).toBeInTheDocument();
    expect(screen.getByText("Amina Shop")).toBeInTheDocument();
    expect(window.localStorage.getItem(WELCOME_FLAG)).toBe("1");
    cleanup();
    // Second visit: still signed in, no welcome.
    await mount();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("amina@example.dz")).toBeInTheDocument();
  });

  it("does not repeat the welcome after a later sign-in once it was shown", async () => {
    window.localStorage.setItem(WELCOME_FLAG, "1");
    await mount();
    await startSignIn();
    accounts = [amina];
    statusQueue = [{ state: "done", summary: { accountId: 1, email: amina.email, plan: null, workspace: null, planUsageEnabled: true } }];
    await advance(2000);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing to a person who may not manage integrations, and asks the server nothing", async () => {
    const { container } = await mount({ canManage: false });
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["fr", "ar"] as const)("renders the signed-in list in %s", async (locale) => {
    harness.locale = locale;
    accounts = [amina, karim];
    const { container } = await mount();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("[dir]")?.getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(container.textContent).not.toContain("aiKey.chatgpt.");
  });
});

describe("(d) plan allowance not granted", () => {
  it("says so in plain words and offers a button that repeats the sign-in for that account", async () => {
    accounts = [{ ...amina, planUsageEnabled: false }];
    await mount();
    expect(screen.getByText(/did not allow SahelFlow to use your plan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow plan usage" }));
    await flush();
    const init = calls("/api/ai/openai/sign-in")[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ accountId: 1 });
    expect(openMock).toHaveBeenCalledWith(AUTH_URL, "_blank", "noopener noreferrer");
  });
});

describe("(e) errors in plain words, by stable code", () => {
  it("OPENAI_PLAN_NOT_ELIGIBLE: says which plans work and scrolls to the Groq card", async () => {
    signIn = () => json({ ok: false, code: "OPENAI_PLAN_NOT_ELIGIBLE", error: "server text that must not be shown" }, 409);
    const groq = document.createElement("div");
    groq.id = "ai-key-groq";
    groq.scrollIntoView = vi.fn();
    document.body.appendChild(groq);
    await mount();
    await startSignIn();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Your ChatGPT plan cannot be used by apps. SahelFlow needs ChatGPT Go, Plus or Pro. You can use the free Groq key instead.",
    );
    expect(alert.textContent).not.toContain("server text");
    fireEvent.click(screen.getByRole("button", { name: "Go to the Groq key" }));
    expect(groq.scrollIntoView).toHaveBeenCalledTimes(1);
    groq.remove();
  });

  it("OPENAI_QUOTA_EXHAUSTED: 'Usage limit reached' with a Manage usage link and no time", async () => {
    await mount();
    await startSignIn();
    statusQueue = [{ state: "failed", code: "OPENAI_QUOTA_EXHAUSTED", error: "x" }];
    await advance(2000);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Usage limit reached");
    expect(alert.textContent).not.toMatch(/\d/);
    expect(within(alert).getByRole("link", { name: "Manage usage" })).toHaveAttribute("href", USAGE_URL);
  });

  it("OPENAI_SESSION_REVOKED: asks to sign in again and offers the button", async () => {
    await mount();
    await startSignIn();
    statusQueue = [{ state: "failed", code: "OPENAI_SESSION_REVOKED" }];
    await advance(2000);
    expect(screen.getByRole("alert")).toHaveTextContent("Your ChatGPT sign-in is no longer valid. Please sign in again.");
    expect(screen.getByRole("button", { name: "Continue with ChatGPT" })).toBeInTheDocument();
  });

  it("consent declined: 'No problem, nothing was changed.'", async () => {
    await mount();
    await startSignIn();
    statusQueue = [{ state: "failed", code: "OPENAI_CONSENT_DECLINED", reason: "declined" }];
    await advance(2000);
    expect(screen.getByRole("alert")).toHaveTextContent("No problem, nothing was changed.");
    expect(screen.getByRole("button", { name: "Continue with ChatGPT" })).toBeInTheDocument();
  });

  it.each(["fr", "ar"] as const)("shows the plan-not-eligible sentence in %s from the app's own texts", async (locale) => {
    harness.locale = locale;
    signIn = () => json({ ok: false, code: "OPENAI_PLAN_NOT_ELIGIBLE", error: "server text" }, 409);
    await mount();
    fireEvent.click(screen.getAllByRole("button")[0]!);
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Groq");
    expect(alert.textContent).not.toContain("server text");
    expect(alert.textContent).not.toContain("aiKey.chatgpt.");
  });
});

describe("re-authentication and accessibility", () => {
  it("asks for the PIN when the server says the recent check is needed, then continues", async () => {
    accountsResponse = () => json({ ok: false, code: "REAUTHENTICATION_REQUIRED", error: "x" }, 403);
    await mount();
    const pin = screen.getByLabelText("PIN");
    expect(pin).toHaveAttribute("type", "password");
    accountsResponse = null;
    accounts = [amina];
    fireEvent.change(pin, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await flush();
    expect(JSON.parse(String((calls("/api/auth/reauthenticate")[0]![1] as RequestInit).body))).toEqual({ pin: "1234" });
    expect(screen.getByText("amina@example.dz")).toBeInTheDocument();
  });

  it("every button has a name, the sign-in button takes keyboard focus, and the page shows no secret", async () => {
    accounts = [amina, karim];
    const { container } = await mount();
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName();
    expect(container.innerHTML).not.toMatch(/token|secret|app_[A-Za-z0-9]/i);
    cleanup();
    accounts = [];
    await mount();
    const signInButton = screen.getByRole("button", { name: "Continue with ChatGPT" });
    signInButton.focus();
    expect(document.activeElement).toBe(signInButton);
  });
});
