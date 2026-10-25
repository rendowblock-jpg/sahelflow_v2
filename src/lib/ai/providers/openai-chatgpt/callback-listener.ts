/**
 * The short-lived loopback listener that receives the browser's return from
 * "Sign in with ChatGPT". OpenAI sends the user's SYSTEM browser back to
 * http://127.0.0.1:<port>/auth/callback, and that browser carries no SahelFlow
 * session, so this is not an app route: it is a tiny server that exists only
 * while one sign-in is pending, bound to 127.0.0.1 and nothing else.
 * Spec: developers.openai.com/siwc/token-sharing-open-source/sign-in (step 2, redirect_uri).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { OpenAiProviderError } from "./errors";
import { CALLBACK_PATH, DEFAULT_CALLBACK_PORT, redirectUriForPort } from "./oauth";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
/** Longest code or client id accepted; a real answer is far shorter. */
const MAX_VALUE_LENGTH = 4096;

export type CallbackResult = { code: string; issuedClientId?: string } | { error: string };

export interface CallbackListenerOptions {
  /** Tried in order; 0 means "any free port". */
  ports?: readonly number[];
  timeoutMs?: number;
  expectedState: string;
}

export interface CallbackListener {
  redirectUri: string;
  result: Promise<CallbackResult>;
  /** Idempotent. Ends the wait with { error: "closed" } when nothing arrived yet. */
  close(): Promise<void>;
}

type Locale = "ar" | "fr" | "en";
const COPY: Record<Locale, { dir: "rtl" | "ltr"; text: string }> = {
  ar: { dir: "rtl", text: "يمكنك إغلاق هذه الصفحة والعودة إلى SahelFlow." },
  fr: { dir: "ltr", text: "Vous pouvez fermer cet onglet et revenir dans SahelFlow." },
  en: { dir: "ltr", text: "You can close this tab and go back to SahelFlow." },
};
const STYLE = "body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f8;color:#1b1f23}main{padding:2rem;font-size:1.15rem;text-align:center}";
// The page has one inline style and no script, so the policy allows exactly that style by hash.
const STYLE_HASH = createHash("sha256").update(STYLE).digest("base64");
const CSP = `default-src 'none'; style-src 'sha256-${STYLE_HASH}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

/** First language in Accept-Language (highest q first) that we have; the app default is French. */
export function pickLocale(header: string | undefined): Locale {
  const ranked = (header ?? "").split(",").map((part, index) => {
    const [tag = "", ...params] = part.trim().split(";");
    const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith("q="))?.slice(2) ?? 1);
    return { primary: tag.trim().toLowerCase().split("-")[0] ?? "", q: Number.isFinite(q) ? q : 0, index };
  }).sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { primary, q } of ranked) {
    if (q > 0 && (primary === "ar" || primary === "fr" || primary === "en")) return primary;
  }
  return "fr";
}

function page(locale: Locale): string {
  const { dir, text } = COPY[locale];
  return `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SahelFlow</title><style>${STYLE}</style></head><body><main>${text}</main></body></html>`;
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const SAFE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": CSP,
  Connection: "close",
} as const;

function notFound(res: ServerResponse): void {
  // No body, nothing from the request is echoed.
  res.writeHead(404, { ...SAFE_HEADERS, "Content-Length": "0" });
  res.end();
}

/** One listener at a time: a new sign-in replaces the old one. */
let active: { supersede(): Promise<void> } | null = null;

function listenOnce(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("no address"));
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ port, host: LOOPBACK_HOST, exclusive: true });
  });
}

export async function startCallbackListener(options: CallbackListenerOptions): Promise<CallbackListener> {
  if (active) await active.supersede();

  let settle!: (value: CallbackResult) => void;
  let settled = false;
  const result = new Promise<CallbackResult>((resolve) => {
    settle = (value) => { if (!settled) { settled = true; resolve(value); } };
  });

  let boundPort = 0;
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    // The Host header must name the loopback address we bound (blocks DNS rebinding).
    const host = req.headers.host ?? "";
    if (settled || req.method !== "GET" || (host !== `${LOOPBACK_HOST}:${boundPort}`)) return notFound(res);
    let parsed: URL;
    try { parsed = new URL(req.url ?? "", `http://${LOOPBACK_HOST}:${boundPort}`); } catch { return notFound(res); }
    if (parsed.pathname !== CALLBACK_PATH) return notFound(res);
    const query = parsed.searchParams;
    if (!sameText(query.get("state") ?? "", options.expectedState)) return notFound(res);

    const error = query.get("error");
    const code = query.get("code");
    const clientId = query.get("client_id");
    if (error) {
      settle({ error: /^[a-z_]{1,64}$/.test(error) ? error : "unknown_error" });
    } else if (!code || code.length > MAX_VALUE_LENGTH) {
      settle({ error: "missing_code" });
    } else {
      settle({ code, ...(clientId && clientId.length <= MAX_VALUE_LENGTH ? { issuedClientId: clientId } : {}) });
    }
    const body = page(pickLocale(req.headers["accept-language"]));
    res.writeHead(200, { ...SAFE_HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
    res.end(body, () => { void closeServer(); });
  };

  const server = createServer(handler);
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;

  let closing: Promise<void> | null = null;
  const closeServer = (): Promise<void> => {
    closing ??= new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
    return closing;
  };

  let port: number | null = null;
  for (const candidate of options.ports ?? [DEFAULT_CALLBACK_PORT, 0]) {
    try { port = await listenOnce(server, candidate); break; } catch { /* busy or refused: try the next port */ }
  }
  if (port === null) {
    // The system message names ports and paths; the caller gets a coded error only.
    throw new OpenAiProviderError("OPENAI_NETWORK_ERROR", "The sign-in listener could not start");
  }
  boundPort = port;

  const timer = setTimeout(() => { settle({ error: "timeout" }); void closeServer(); }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  timer.unref?.();

  const close = async (reason: "closed" | "superseded" = "closed"): Promise<void> => {
    clearTimeout(timer);
    settle({ error: reason });
    await closeServer();
    if (active === self) active = null;
  };
  const self = { supersede: () => close("superseded") };
  active = self;
  void result.then(() => { clearTimeout(timer); if (active === self) active = null; });

  return { redirectUri: redirectUriForPort(port), result, close: () => close("closed") };
}
