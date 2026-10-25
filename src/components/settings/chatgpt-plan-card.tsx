"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { openInSystemBrowser } from "@/lib/system-browser";

const ACCOUNTS_URL = "/api/ai/openai/accounts";
const SIGN_IN_URL = "/api/ai/openai/sign-in";
const USAGE_URL = "https://chatgpt.com/settings/usage";
/** Only OpenAI's own sign-in page may be opened from the address the server returns. */
const SIGN_IN_HOSTS = ["auth.openai.com"] as const;
const POLL_EVERY_MS = 2000;
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;
const WELCOME_FLAG = "sahelflow-chatgpt-welcome-seen";
/** The Groq key card carries this id (ai-key-panel.tsx) so "use Groq instead" can lead the seller there. */
const GROQ_CARD_ID = "ai-key-groq";

interface Account {
  id: number;
  email: string | null;
  planUsageEnabled: boolean;
  signedIn: boolean;
  active: boolean;
}
interface SignInSummary {
  accountId: number;
  plan?: string | null;
  workspace?: string | null;
}
type Problem = "timeout" | "declined" | "generic" | "loadFailed" | "notEligible" | "quota" | "revoked";
type Retry = { kind: "load" } | { kind: "signIn"; accountId?: number } | { kind: "activate"; id: number } | { kind: "signOut"; id: number };
type Phase = "loading" | "idle" | "waiting" | "pin";
type Json = { ok?: boolean; code?: string; accounts?: Account[]; url?: string; attemptId?: string; state?: string; reason?: string; summary?: SignInSummary };

const FAILURE_PROBLEM: Record<string, Problem> = {
  OPENAI_PLAN_NOT_ELIGIBLE: "notEligible",
  OPENAI_QUOTA_EXHAUSTED: "quota",
  OPENAI_SESSION_REVOKED: "revoked",
  OPENAI_CONSENT_DECLINED: "declined",
};

function problemFor(code: string | undefined, reason?: string): Problem {
  if (reason === "timeout") return "timeout";
  if (reason === "declined") return "declined";
  return (code && FAILURE_PROBLEM[code]) || "generic";
}

/** Remembers on this computer that the welcome message was shown (same place the theme choice is kept). */
function takeWelcomeTurn(): boolean {
  try {
    if (window.localStorage.getItem(WELCOME_FLAG) === "1") return false;
    window.localStorage.setItem(WELCOME_FLAG, "1");
  } catch {
    // Storage blocked: showing the message again is better than never showing it.
  }
  return true;
}

function goToGroqCard() {
  const card = document.getElementById(GROQ_CARD_ID);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  card.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
}

/** "Use your ChatGPT plan": sign in with ChatGPT in the system browser, then manage the signed-in accounts. */
export function ChatGptPlanCard({ canManage }: { canManage: boolean }) {
  const { t, dir } = useI18n();
  const { resolvedTheme } = useTheme();
  const [phase, setPhase] = useState<Phase>("loading");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [summary, setSummary] = useState<SignInSummary | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  // The address and the attempt id live in refs: they are never rendered.
  const attemptRef = useRef<{ id: string; url: string } | null>(null);
  const pollTimer = useRef<number | null>(null);
  const deadlineTimer = useRef<number | null>(null);
  const runRef = useRef(0);
  const retryRef = useRef<Retry | null>(null);
  // A ref, not state: a click that resumes after the PIN must not see a stale "busy".
  const busyRef = useRef(false);
  const setWorking = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };

  const stopPolling = useCallback(() => {
    runRef.current += 1;
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    if (deadlineTimer.current !== null) window.clearTimeout(deadlineTimer.current);
    pollTimer.current = null;
    deadlineTimer.current = null;
  }, []);

  /** One call to our routes. A "recent PIN check needed" answer parks the action and shows the PIN field. */
  const call = useCallback(async (url: string, init: RequestInit | undefined, retry: Retry) => {
    const response = await fetch(url, { cache: "no-store", ...init });
    const body = (await response.json().catch(() => ({}))) as Json;
    if (response.status === 403 && body.code === "REAUTHENTICATION_REQUIRED") {
      retryRef.current = retry;
      setPhase("pin");
      return null;
    }
    return { response, body };
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await call(ACCOUNTS_URL, undefined, { kind: "load" });
      if (!result) return;
      if (!result.response.ok || !Array.isArray(result.body.accounts)) throw new Error("load failed");
      setAccounts(result.body.accounts);
      setPhase((current) => (current === "waiting" ? current : "idle"));
    } catch {
      setProblem("loadFailed");
      setPhase((current) => (current === "waiting" ? current : "idle"));
    }
  }, [call]);

  useEffect(() => {
    if (!canManage) return;
    // Deferred like the Groq card: the first load must not set state inside the effect itself.
    const first = window.setTimeout(() => void loadAccounts(), 0);
    return () => {
      window.clearTimeout(first);
      stopPolling();
    };
  }, [canManage, loadAccounts, stopPolling]);

  /** Asks for the outcome every 2 seconds until it is known; stopPolling() ends it (the run number changes). */
  const watch = useCallback(
    async (run: number) => {
      while (run === runRef.current) {
        await new Promise<void>((resolve) => {
          pollTimer.current = window.setTimeout(resolve, POLL_EVERY_MS);
        });
        const attempt = attemptRef.current;
        if (!attempt || run !== runRef.current) return;
        let body: Json = {};
        try {
          const response = await fetch(`${SIGN_IN_URL}/status?attempt=${encodeURIComponent(attempt.id)}`, { cache: "no-store" });
          body = (await response.json().catch(() => ({}))) as Json;
        } catch {
          body = { state: "pending" };
        }
        if (run !== runRef.current) return;
        const finished = body.state === "done" || body.state === "failed" || body.ok === false;
        if (!finished) continue;
        stopPolling();
        attemptRef.current = null;
        setPhase("idle");
        if (body.state === "done") {
          setSummary(body.summary ?? null);
          setProblem(null);
          if (takeWelcomeTurn()) setWelcome(true);
        } else {
          setProblem(problemFor(body.code, body.reason));
        }
        if (body.state) await loadAccounts();
        return;
      }
    },
    [loadAccounts, stopPolling],
  );

  const startSignIn = useCallback(
    async (accountId?: number) => {
      if (busyRef.current) return;
      setWorking(true);
      setProblem(null);
      setWelcome(false);
      try {
        const result = await call(
          SIGN_IN_URL,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(accountId ? { accountId } : {}) },
          { kind: "signIn", accountId },
        );
        if (!result) return;
        const { response, body } = result;
        if (!response.ok || !body.ok || !body.url || !body.attemptId) {
          setProblem(problemFor(body.code));
          return;
        }
        if (!openInSystemBrowser(body.url, SIGN_IN_HOSTS)) {
          setProblem("generic");
          return;
        }
        stopPolling();
        attemptRef.current = { id: body.attemptId, url: body.url };
        setPhase("waiting");
        const run = runRef.current;
        deadlineTimer.current = window.setTimeout(() => {
          stopPolling();
          attemptRef.current = null;
          setProblem("timeout");
          setPhase("idle");
        }, GIVE_UP_AFTER_MS);
        void watch(run);
      } catch {
        setProblem("generic");
      } finally {
        setWorking(false);
      }
    },
    [call, watch, stopPolling],
  );

  const cancel = () => {
    stopPolling();
    attemptRef.current = null;
    setPhase("idle");
  };

  const reopen = () => {
    const attempt = attemptRef.current;
    if (attempt && !openInSystemBrowser(attempt.url, SIGN_IN_HOSTS)) setProblem("generic");
  };

  const changeAccount = async (url: string, method: "POST" | "DELETE", retry: Retry) => {
    if (busyRef.current) return;
    setWorking(true);
    setProblem(null);
    try {
      const result = await call(url, { method }, retry);
      if (!result) return;
      if (!result.response.ok) setProblem(problemFor(result.body.code));
      await loadAccounts();
    } catch {
      setProblem("generic");
    } finally {
      setWorking(false);
    }
  };
  const activate = (id: number): void => void changeAccount(`${ACCOUNTS_URL}/${id}/activate`, "POST", { kind: "activate", id });
  const signOut = (id: number): void => void changeAccount(`${ACCOUNTS_URL}/${id}`, "DELETE", { kind: "signOut", id });

  const confirmPin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pin.trim() || busyRef.current) return;
    setWorking(true);
    setPinError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        setPinError(t(response.status === 401 ? "aiKey.pinIncorrect" : response.status === 429 ? "aiKey.pinLocked" : "aiKey.chatgpt.error.generic"));
        return;
      }
      setPin("");
      setPhase("idle");
      setWorking(false);
      const retry = retryRef.current;
      retryRef.current = null;
      if (retry?.kind === "load") await loadAccounts();
      else if (retry?.kind === "signIn") await startSignIn(retry.accountId);
      else if (retry?.kind === "activate") activate(retry.id);
      else if (retry?.kind === "signOut") signOut(retry.id);
    } catch {
      setPinError(t("aiKey.chatgpt.error.generic"));
    } finally {
      setWorking(false);
    }
  };

  if (!canManage) return null;

  const signedIn = accounts.filter((account) => account.signedIn);
  const withoutAllowance = signedIn.find((account) => !account.planUsageEnabled);
  const dark = resolvedTheme === "dark";
  // OpenAI's approved formats: white logo on a black button, or black logo on a white button (with a border).
  const buttonLook = dark
    ? "border border-neutral-500 bg-white text-black hover:bg-neutral-200"
    : "border border-black bg-black text-white hover:bg-neutral-800";
  const logo = dark ? "/brand/chatgpt/chatgpt-logo-black.svg" : "/brand/chatgpt/chatgpt-logo-white.svg";
  const signInButton = (accountId?: number, label = t("aiKey.chatgpt.signIn")) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => void startSignIn(accountId)}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 ${buttonLook}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- OpenAI's own SVG, shown unmodified; the label carries the name */}
      <img src={logo} alt="" width={21} height={21} className="shrink-0" />
      {label}
    </button>
  );
  const usageLink = (label: string) => (
    <a href={USAGE_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-2">
      {label}
    </a>
  );

  return (
    <Card dir={dir} id="ai-key-chatgpt">
      <CardHeader>
        <CardTitle className="text-base" role="heading" aria-level={3}>
          {t("aiKey.chatgpt.title")}
        </CardTitle>
        <CardDescription>{t("aiKey.chatgpt.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {phase === "loading" ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}

        {welcome ? (
          <div role="status" className="flex items-start justify-between gap-3 rounded-md border bg-muted/40 p-3 text-sm">
            <p>{t("aiKey.chatgpt.welcome")}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setWelcome(false)}>
              {t("aiKey.chatgpt.welcomeDismiss")}
            </Button>
          </div>
        ) : null}

        {problem ? (
          <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
            <p>{t(`aiKey.chatgpt.error.${problem}`)}</p>
            {problem === "quota" ? usageLink(t("aiKey.chatgpt.manageUsage")) : null}
            {problem === "notEligible" ? (
              <Button type="button" size="sm" variant="outline" onClick={goToGroqCard}>
                {t("aiKey.chatgpt.error.goToGroq")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {phase === "pin" ? (
          <form onSubmit={(event) => void confirmPin(event)} className="space-y-2">
            <p className="text-sm">{t("aiKey.chatgpt.pinHelp")}</p>
            <label htmlFor="chatgpt-pin" className="text-sm font-medium">
              {t("aiKey.chatgpt.pinLabel")}
            </label>
            <Input id="chatgpt-pin" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value)} />
            {pinError ? <p role="alert" className="text-sm text-destructive">{pinError}</p> : null}
            <Button type="submit" size="sm" disabled={busy || !pin.trim()}>
              {t("aiKey.chatgpt.pinConfirm")}
            </Button>
          </form>
        ) : null}

        {signedIn.length > 0 ? (
          <ul aria-label={t("aiKey.chatgpt.accountsLabel")} className="space-y-2">
            {signedIn.map((account) => {
              const name = account.email ?? t("aiKey.chatgpt.accountUnknown");
              const fresh = summary && summary.accountId === account.id ? summary : null;
              return (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      <bdi>{name}</bdi>{" "}
                      {account.active ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium">{t("aiKey.chatgpt.inUse")}</span> : null}
                    </p>
                    {fresh?.plan ? (
                      <p className="text-xs text-muted-foreground">
                        {t("aiKey.chatgpt.plan")}: <bdi>{fresh.plan}</bdi>
                      </p>
                    ) : null}
                    {fresh?.workspace ? (
                      <p className="text-xs text-muted-foreground">
                        {t("aiKey.chatgpt.workspace")}: <bdi>{fresh.workspace}</bdi>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {!account.active ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => activate(account.id)} aria-label={`${t("aiKey.chatgpt.useAccount")} (${name})`}>
                        {t("aiKey.chatgpt.useAccount")}
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => signOut(account.id)} aria-label={`${t("aiKey.chatgpt.signOut")} (${name})`}>
                      {t("aiKey.chatgpt.signOut")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {withoutAllowance && phase !== "waiting" ? (
          <div className="space-y-2 text-sm">
            <p>{t("aiKey.chatgpt.planOff")}</p>
            <Button type="button" size="sm" disabled={busy} onClick={() => void startSignIn(withoutAllowance.id)}>
              {t("aiKey.chatgpt.planOffGrant")}
            </Button>
          </div>
        ) : null}

        {phase === "waiting" ? (
          <div role="status" className="space-y-3 rounded-md border p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("aiKey.chatgpt.waitingTitle")}
            </p>
            <p className="text-muted-foreground">{t("aiKey.chatgpt.waitingHelp")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={reopen}>
                {t("aiKey.chatgpt.reopen")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={cancel}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "idle" || phase === "pin" ? (
          <div className="space-y-3">
            {signedIn.length === 0 ? signInButton() : (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void startSignIn()}>
                  {t("aiKey.chatgpt.addAccount")}
                </Button>
                {usageLink(t("aiKey.chatgpt.manageUsageInChatGpt"))}
              </div>
            )}
          </div>
        ) : null}

        {phase !== "loading" ? <p className="text-xs leading-relaxed text-muted-foreground">{t("aiKey.chatgpt.disclosure")}</p> : null}
      </CardContent>
    </Card>
  );
}
