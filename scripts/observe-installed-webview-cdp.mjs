import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [name, ...value] = argument.replace(/^--/, "").split("=");
    return [name, value.join("=")];
  }),
);

const endpoint = options.endpoint ?? "http://127.0.0.1:9222";
const output = resolve(options.output ?? "webview-cdp-events.jsonl");
const summaryOutput = resolve(options.summary ?? "webview-cdp-summary.json");
const timeoutMilliseconds = Number(options.timeout ?? 105_000);
const startedAt = Date.now();

mkdirSync(dirname(output), { recursive: true });

function redactText(value) {
  return String(value ?? "")
    .replace(/(sf_runtime=)[^;\s]+/giu, "$1[redacted]")
    .replace(/\b[a-f0-9]{64}\b/giu, "[redacted-hex64]")
    .slice(0, 4_000);
}

function safeUrl(value) {
  const text = String(value ?? "");
  if (text.startsWith("data:")) return "data:[redacted]";
  if (text.startsWith("about:")) return text;
  try {
    const parsed = new URL(text);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return redactText(text).replace(/[?#].*$/u, "");
  }
}

function cookieMetadata(cookie) {
  return {
    name: String(cookie?.name ?? ""),
    domain: String(cookie?.domain ?? ""),
    path: String(cookie?.path ?? ""),
    httpOnly: Boolean(cookie?.httpOnly),
    secure: Boolean(cookie?.secure),
    sameSite: String(cookie?.sameSite ?? ""),
    session: cookie?.session === undefined ? undefined : Boolean(cookie.session),
  };
}

function cookieNamesFromHeader(headers) {
  const entry = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === "cookie",
  );
  if (!entry) return [];
  return String(entry[1])
    .split(";")
    .map((item) => item.split("=", 1)[0]?.trim())
    .filter(Boolean)
    .sort();
}

function setCookieNames(headers) {
  return Object.entries(headers ?? {})
    .filter(([name]) => name.toLowerCase() === "set-cookie")
    .flatMap(([, value]) => String(value).split(/\r?\n/u))
    .map((item) => item.split("=", 1)[0]?.trim())
    .filter(Boolean)
    .sort();
}

const state = {
  endpointObserved: false,
  browserConnected: false,
  sfRuntimeCookieObserved: false,
  rootRequestObserved: false,
  rootRequestCookieObserved: false,
  rootResponseObserved: false,
  rootResponseStatus: null,
  rootFinishedObserved: false,
  rootFailureObserved: false,
  frameNavigationRequested: false,
  frameNavigationCompleted: false,
  domContentLoaded: false,
  loadCompleted: false,
  initScriptObserved: false,
  reactMarkerObserved: false,
  nextClientPayloadObserved: false,
  javascriptExceptionObserved: false,
  processFailureObserved: false,
  uiReadyRequestObserved: false,
  uiReadyResponseObserved: false,
  uiReadyResponseStatus: null,
};
const requestUrls = new Map();
const pageStateSignatures = new WeakMap();
let sequence = 0;
let lastCookieSignature = "";
let uiReadyAt = null;

function record(event, detail = {}) {
  appendFileSync(
    output,
    `${JSON.stringify({
      sequence: ++sequence,
      elapsedMilliseconds: Date.now() - startedAt,
      capturedAt: new Date().toISOString(),
      event,
      ...detail,
    })}\n`,
    "utf8",
  );
}

function classifyUrl(value) {
  try {
    const parsed = new URL(value);
    const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    return {
      safe: safeUrl(value),
      loopback,
      root: loopback && parsed.pathname === "/",
      uiReady: loopback && parsed.pathname === "/api/internal/runtime-ui-ready",
    };
  } catch {
    return { safe: safeUrl(value), loopback: false, root: false, uiReady: false };
  }
}

async function discoverEndpoint() {
  const response = await fetch(`${endpoint}/json/version`, {
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const version = await response.json();
  if (!state.endpointObserved) {
    state.endpointObserved = true;
    record("browser-endpoint-observed", {
      browser: redactText(version.Browser),
      protocolVersion: redactText(version["Protocol-Version"]),
      userAgent: redactText(version["User-Agent"]),
    });
  }
}

async function recordCookies(context, phase) {
  const cookies = (await context.cookies()).map(cookieMetadata);
  const signature = JSON.stringify(cookies);
  if (signature === lastCookieSignature) return;
  lastCookieSignature = signature;
  if (cookies.some((cookie) => cookie.name === "sf_runtime")) {
    state.sfRuntimeCookieObserved = true;
  }
  record("cookie-store-snapshot", { phase, cookies });
}

async function recordPageState(page, phase) {
  try {
    const snapshot = await page.evaluate(() => {
      const root = document.getElementById("__next") ?? document.querySelector("main");
      const candidates = [
        document.documentElement,
        document.body,
        ...Array.from(document.querySelectorAll("*")).slice(0, 500),
      ].filter(Boolean);
      const reactMarkerElementCount = candidates.filter((element) =>
        Object.getOwnPropertyNames(element).some(
          (name) =>
            name.startsWith("__reactContainer$") ||
            name.startsWith("__reactFiber$") ||
            name === "_reactRootContainer",
        ),
      ).length;
      const nextClientPayloadPresent = Array.from(document.scripts).some(
        (script) => !script.src && script.textContent?.includes("self.__next_f.push"),
      );
      return {
        url: `${location.protocol}//${location.host}${location.pathname}`,
        readyState: document.readyState,
        title: document.title,
        bodyChildCount: document.body?.childElementCount ?? 0,
        rootPresent: Boolean(root),
        rootChildCount: root?.childElementCount ?? 0,
        initScriptPresent: typeof window.__sfDiagnosticInitAt === "number",
        reactMarkerElementCount,
        nextClientPayloadPresent,
      };
    });
    const safeSnapshot = {
      ...snapshot,
      url: safeUrl(snapshot.url),
      title: redactText(snapshot.title),
    };
    const signature = JSON.stringify(safeSnapshot);
    if (pageStateSignatures.get(page) === signature) return;
    pageStateSignatures.set(page, signature);
    if (snapshot.initScriptPresent) state.initScriptObserved = true;
    if (snapshot.reactMarkerElementCount > 0) state.reactMarkerObserved = true;
    if (snapshot.nextClientPayloadPresent) state.nextClientPayloadObserved = true;
    record("page-state-snapshot", { phase, ...safeSnapshot });
  } catch (error) {
    record("page-state-snapshot-failed", {
      phase,
      message: redactText(error?.message ?? error),
    });
  }
}

async function attachPage(context, page, attachedPages) {
  if (attachedPages.has(page)) return;
  attachedPages.add(page);
  record("page-observed", { url: safeUrl(page.url()) });

  page.on("console", (message) => {
    const text = redactText(message.text());
    if (text.includes("SF_DIAGNOSTIC_INIT_SCRIPT")) state.initScriptObserved = true;
    record("javascript-console", { level: message.type(), text });
  });
  page.on("pageerror", (error) => {
    state.javascriptExceptionObserved = true;
    record("javascript-page-error", { message: redactText(error?.stack ?? error?.message ?? error) });
  });
  page.on("domcontentloaded", () => {
    state.domContentLoaded = true;
    record("dom-content-loaded", { url: safeUrl(page.url()) });
  });
  page.on("load", () => {
    state.loadCompleted = true;
    record("page-load-completed", { url: safeUrl(page.url()) });
  });
  page.on("crash", () => {
    state.processFailureObserved = true;
    record("page-crashed", { url: safeUrl(page.url()) });
  });
  page.on("close", () => record("page-closed", { url: safeUrl(page.url()) }));

  const session = await context.newCDPSession(page);
  await Promise.all([
    session.send("Page.enable"),
    session.send("Network.enable"),
    session.send("Runtime.enable"),
    session.send("Log.enable"),
    session.send("Page.setLifecycleEventsEnabled", { enabled: true }),
  ]);
  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      Object.defineProperty(window, "__sfDiagnosticInitAt", {
        value: Date.now(), configurable: false, enumerable: false, writable: false
      });
      console.info("SF_DIAGNOSTIC_INIT_SCRIPT");
      window.addEventListener("error", () => console.error("SF_DIAGNOSTIC_WINDOW_ERROR"));
      window.addEventListener("unhandledrejection", () => console.error("SF_DIAGNOSTIC_UNHANDLED_REJECTION"));
    })();`,
  });

  session.on("Page.frameRequestedNavigation", (event) => {
    const classified = classifyUrl(event.url);
    if (classified.root) state.frameNavigationRequested = true;
    record("frame-navigation-requested", {
      frameId: event.frameId,
      url: classified.safe,
      reason: event.reason,
      disposition: event.disposition,
    });
  });
  session.on("Page.frameStartedLoading", (event) =>
    record("frame-loading-started", { frameId: event.frameId }),
  );
  session.on("Page.frameNavigated", (event) => {
    const classified = classifyUrl(event.frame?.url);
    if (classified.root) state.frameNavigationCompleted = true;
    record("frame-navigation-completed", {
      frameId: event.frame?.id,
      parentId: event.frame?.parentId,
      url: classified.safe,
      mimeType: event.frame?.mimeType,
      unreachableUrl: safeUrl(event.frame?.unreachableUrl),
    });
  });
  session.on("Page.frameStoppedLoading", (event) =>
    record("frame-loading-stopped", { frameId: event.frameId }),
  );
  session.on("Page.lifecycleEvent", (event) =>
    record("page-lifecycle", { frameId: event.frameId, name: event.name }),
  );
  session.on("Page.javascriptDialogOpening", (event) =>
    record("javascript-dialog", { type: event.type, message: redactText(event.message) }),
  );
  session.on("Inspector.targetCrashed", () => {
    state.processFailureObserved = true;
    record("renderer-target-crashed");
  });
  session.on("Inspector.detached", (event) =>
    record("renderer-inspector-detached", { reason: redactText(event.reason) }),
  );
  session.on("Runtime.exceptionThrown", (event) => {
    state.javascriptExceptionObserved = true;
    record("javascript-exception", {
      text: redactText(event.exceptionDetails?.text),
      description: redactText(event.exceptionDetails?.exception?.description),
      url: safeUrl(event.exceptionDetails?.url),
      lineNumber: event.exceptionDetails?.lineNumber,
      columnNumber: event.exceptionDetails?.columnNumber,
    });
  });
  session.on("Log.entryAdded", (event) =>
    record("browser-log", {
      source: event.entry?.source,
      level: event.entry?.level,
      text: redactText(event.entry?.text),
      url: safeUrl(event.entry?.url),
    }),
  );
  session.on("Network.requestWillBeSent", (event) => {
    const classified = classifyUrl(event.request?.url);
    requestUrls.set(event.requestId, classified);
    const cookieNames = cookieNamesFromHeader(event.request?.headers);
    if (classified.root) {
      state.rootRequestObserved = true;
      if (cookieNames.includes("sf_runtime")) state.rootRequestCookieObserved = true;
    }
    if (classified.uiReady) state.uiReadyRequestObserved = true;
    record("network-request", {
      requestId: event.requestId,
      loaderId: event.loaderId,
      frameId: event.frameId,
      type: event.type,
      method: event.request?.method,
      url: classified.safe,
      cookieNames,
      redirectStatus: event.redirectResponse?.status,
      redirectUrl: safeUrl(event.redirectResponse?.url),
    });
  });
  session.on("Network.requestWillBeSentExtraInfo", (event) => {
    const cookies = (event.associatedCookies ?? []).map((entry) => ({
      ...cookieMetadata(entry.cookie),
      blockedReasons: entry.blockedReasons ?? [],
    }));
    const cookieNames = cookieNamesFromHeader(event.headers);
    const classified = requestUrls.get(event.requestId);
    if (classified?.root && cookieNames.includes("sf_runtime")) {
      state.rootRequestCookieObserved = true;
    }
    if (cookies.some((cookie) => cookie.name === "sf_runtime")) {
      state.sfRuntimeCookieObserved = true;
    }
    record("network-request-extra", {
      requestId: event.requestId,
      cookieNames,
      associatedCookies: cookies,
    });
  });
  session.on("Network.responseReceived", (event) => {
    const classified = classifyUrl(event.response?.url);
    if (classified.root) {
      state.rootResponseObserved = true;
      state.rootResponseStatus = event.response?.status ?? null;
    }
    if (classified.uiReady) {
      state.uiReadyResponseObserved = true;
      state.uiReadyResponseStatus = event.response?.status ?? null;
      uiReadyAt = Date.now();
    }
    record("network-response", {
      requestId: event.requestId,
      type: event.type,
      url: classified.safe,
      status: event.response?.status,
      statusText: redactText(event.response?.statusText),
      mimeType: event.response?.mimeType,
      protocol: event.response?.protocol,
      fromDiskCache: event.response?.fromDiskCache,
      fromServiceWorker: event.response?.fromServiceWorker,
    });
  });
  session.on("Network.responseReceivedExtraInfo", (event) =>
    record("network-response-extra", {
      requestId: event.requestId,
      statusCode: event.statusCode,
      setCookieNames: setCookieNames(event.headers),
      blockedCookieNames: (event.blockedCookies ?? []).map((entry) => entry.cookie?.name).filter(Boolean),
    }),
  );
  session.on("Network.loadingFinished", (event) => {
    const classified = requestUrls.get(event.requestId);
    if (classified?.root) state.rootFinishedObserved = true;
    record("network-loading-finished", {
      requestId: event.requestId,
      url: classified?.safe,
      encodedDataLength: event.encodedDataLength,
    });
  });
  session.on("Network.loadingFailed", (event) => {
    const classified = requestUrls.get(event.requestId);
    if (classified?.root) state.rootFailureObserved = true;
    record("network-loading-failed", {
      requestId: event.requestId,
      url: classified?.safe,
      type: event.type,
      errorText: redactText(event.errorText),
      canceled: event.canceled,
      blockedReason: event.blockedReason,
      corsErrorStatus: event.corsErrorStatus?.corsError,
    });
  });

  await recordPageState(page, "attached");
}

record("observer-started", { endpoint, timeoutMilliseconds });
let browser;
try {
  const endpointDeadline = Date.now() + Math.min(timeoutMilliseconds, 45_000);
  while (Date.now() < endpointDeadline) {
    try {
      await discoverEndpoint();
      break;
    } catch (error) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  if (!state.endpointObserved) throw new Error("WebView2 CDP endpoint was not observed");

  browser = await chromium.connectOverCDP(endpoint);
  state.browserConnected = true;
  record("browser-connected", { contextCount: browser.contexts().length });
  browser.on("disconnected", () => record("browser-disconnected"));

  const browserSession = await browser.newBrowserCDPSession();
  browserSession.on("Target.targetCreated", (event) =>
    record("target-created", {
      targetId: event.targetInfo?.targetId,
      type: event.targetInfo?.type,
      title: redactText(event.targetInfo?.title),
      url: safeUrl(event.targetInfo?.url),
    }),
  );
  browserSession.on("Target.targetInfoChanged", (event) =>
    record("target-changed", {
      targetId: event.targetInfo?.targetId,
      type: event.targetInfo?.type,
      title: redactText(event.targetInfo?.title),
      url: safeUrl(event.targetInfo?.url),
    }),
  );
  browserSession.on("Target.targetDestroyed", (event) =>
    record("target-destroyed", { targetId: event.targetId }),
  );
  await browserSession.send("Target.setDiscoverTargets", { discover: true });

  const attachedPages = new WeakSet();
  for (const context of browser.contexts()) {
    context.on("page", (page) => {
      attachPage(context, page, attachedPages).catch((error) =>
        record("page-attach-failed", { message: redactText(error?.stack ?? error) }),
      );
    });
  }

  while (Date.now() - startedAt < timeoutMilliseconds) {
    for (const context of browser.contexts()) {
      await recordCookies(context, "poll");
      for (const page of context.pages()) {
        await attachPage(context, page, attachedPages);
        await recordPageState(page, "poll");
      }
    }
    if (uiReadyAt && Date.now() - uiReadyAt >= 5_000) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
} catch (error) {
  record("observer-error", { message: redactText(error?.stack ?? error?.message ?? error) });
} finally {
  try {
    await browser?.close();
  } catch (error) {
    record("browser-close-error", { message: redactText(error?.message ?? error) });
  }
}

const firstMissingTransition = !state.endpointObserved
  ? "browser-endpoint"
  : !state.browserConnected
    ? "browser-connection"
    : !state.sfRuntimeCookieObserved && !state.rootRequestCookieObserved
      ? "runtime-cookie"
      : !state.rootRequestObserved
        ? "loopback-root-request"
        : !state.rootResponseObserved
          ? "loopback-root-response"
          : !state.rootFinishedObserved
            ? "loopback-root-completion"
            : !state.frameNavigationCompleted
              ? "frame-navigation-completion"
              : !state.uiReadyRequestObserved
                ? "hydration-or-ui-ready-request"
                : !state.uiReadyResponseObserved
                  ? "ui-ready-response"
                  : null;

writeFileSync(
  summaryOutput,
  `${JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      elapsedMilliseconds: Date.now() - startedAt,
      firstMissingTransition,
      state,
      note: "Cookie values, authorization values, URL queries, and URL fragments are not recorded.",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
record("observer-completed", { firstMissingTransition, state });
