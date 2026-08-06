(() => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const safeText = (value, limit) => String(value ?? "").replace(/[\r\n\0]/g, " ").slice(0, limit);

  const diagnosticUrl = () => {
    try {
      const url = new URL("/api/internal/runtime-browser-diagnostic", globalThis.location.href);
      if (
        url.protocol !== "http:" ||
        (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      ) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  };

  const record = (stage, detail = {}) => {
    const url = diagnosticUrl();
    if (!url) return;
    const body = JSON.stringify({
      stage,
      path: safeText(globalThis.location.pathname, 256),
      errorName: safeText(detail.errorName, 64),
      message: safeText(detail.message, 512),
      status: Number.isInteger(detail.status) ? detail.status : null,
    });
    void originalFetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body,
    }).catch(() => undefined);
  };

  record("initialization-script");
  globalThis.addEventListener("error", (event) => {
    record("javascript-error", {
      errorName: event.error?.name ?? "Error",
      message: event.message || event.error?.message || "javascript error without message",
    });
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    record("unhandled-rejection", {
      errorName: reason?.name ?? typeof reason,
      message: reason?.message ?? reason ?? "unhandled rejection without reason",
    });
  });
  globalThis.document.addEventListener(
    "DOMContentLoaded",
    () => {
      record("dom-content-loaded");
      globalThis.requestAnimationFrame(() => {
        const root = globalThis.document.getElementById("__next") ?? globalThis.document.body;
        record(root && root.childElementCount > 0 ? "react-root-present" : "react-root-empty");
      });
    },
    { once: true },
  );
  globalThis.addEventListener("load", () => record("window-load"), { once: true });

  globalThis.fetch = async (...args) => {
    let pathname = "";
    try {
      const candidate = args[0] instanceof Request ? args[0].url : String(args[0]);
      pathname = new URL(candidate, globalThis.location.href).pathname;
    } catch {
      pathname = "";
    }
    const observesUiReady = pathname === "/api/internal/runtime-ui-ready";
    if (observesUiReady) record("ui-ready-request");
    try {
      const response = await originalFetch(...args);
      if (observesUiReady) record("ui-ready-response", { status: response.status });
      return response;
    } catch (error) {
      if (observesUiReady) {
        record("ui-ready-fetch-error", {
          errorName: error?.name ?? "Error",
          message: error?.message ?? "UI-ready fetch failed",
        });
      }
      throw error;
    }
  };
})();
