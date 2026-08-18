import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";
import { chromium } from "@playwright/test";

function requiredArg(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing-${name.slice(2)}`);
  return value;
}

function isLoopback(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function isExactAppPage(page, baseUrl) {
  try {
    const candidate = new URL(page.url());
    return (
      baseUrl.protocol === "http:" &&
      candidate.protocol === "http:" &&
      isLoopback(baseUrl.hostname) &&
      isLoopback(candidate.hostname) &&
      candidate.port === baseUrl.port
    );
  } catch {
    return false;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseInput(raw) {
  const decoded = JSON.parse(raw);
  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof decoded.pin !== "string" ||
    decoded.pin.length < 1 ||
    typeof decoded.phone !== "string" ||
    decoded.phone.length < 1 ||
    typeof decoded.activateTrial !== "boolean"
  ) {
    throw new Error("invalid-input");
  }
  return {
    pin: decoded.pin,
    phone: decoded.phone,
    activateTrial: decoded.activateTrial,
  };
}

function writeDispatchMarker(path) {
  const fd = openSync(path, "w");
  try {
    const payload = Buffer.from(
      JSON.stringify({
        formatVersion: 1,
        state: "dispatch-guarded",
        createdAtUnixMs: Date.now(),
      }),
      "utf8",
    );
    writeSync(fd, payload, 0, payload.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function failureClass(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout")) return "timeout";
  if (message.includes("econnrefused") || message.includes("connection refused")) {
    return "connect-refused";
  }
  if (message.includes("websocket")) return "websocket";
  if (message.includes("closed") || message.includes("disconnected")) {
    return "disconnected";
  }
  if (message.includes("target") || message.includes("page")) return "target";
  return "other";
}

function writeWireResult(value, exitCode) {
  process.stdout.write(`${JSON.stringify(value)}\n`, () => process.exit(exitCode));
}

function validateResult(value) {
  if (!value || typeof value !== "object") throw new Error("invalid-result");
  if (
    typeof value.setupStatus !== "number" ||
    typeof value.trialStatus !== "number" ||
    !(typeof value.trialState === "string" || value.trialState === null) ||
    typeof value.searchStatus !== "number" ||
    typeof value.customerTotal !== "number" ||
    typeof value.secretStatus !== "number" ||
    typeof value.secretConfigured !== "boolean"
  ) {
    throw new Error("invalid-result");
  }
  return value;
}

async function main() {
  let stage = "input";
  try {
    const debugPort = Number(requiredArg("--debug-port"));
    const baseUrl = new URL(requiredArg("--base-url"));
    const dispatchMarker = requiredArg("--dispatch-marker");
    if (
      !Number.isInteger(debugPort) ||
      debugPort < 1 ||
      debugPort > 65535 ||
      baseUrl.protocol !== "http:" ||
      !isLoopback(baseUrl.hostname) ||
      !baseUrl.port
    ) {
      throw new Error("invalid-endpoint");
    }
    const input = parseInput(await readStdin());

    stage = "connect";
    const endpoint = `http://127.0.0.1:${debugPort}`;
    const browser = await chromium.connectOverCDP(endpoint, {
      headers: { Origin: endpoint },
      timeout: 5_000,
    });

    stage = "target";
    const targetDeadline = Date.now() + 5_000;
    let page;
    do {
      const candidates = browser
        .contexts()
        .flatMap((context) => context.pages())
        .filter((candidate) => isExactAppPage(candidate, baseUrl));
      if (candidates.length > 1) throw new Error("ambiguous-app-target");
      [page] = candidates;
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < targetDeadline);
    if (!page) throw new Error("app-target-not-ready");

    // The marker is deliberately durable and contains no bearer or seller data.
    // Once it exists, the PowerShell caller must never retry this mutating
    // journey because a transport loss can make the result ambiguous.
    stage = "evaluate";
    writeDispatchMarker(dispatchMarker);
    const result = await page.evaluate(async (acceptedInput) => {
      const request = async (path, method = "GET", body = undefined) => {
        const response = await fetch(path, {
          method,
          credentials: "same-origin",
          headers:
            body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        let decoded = null;
        try {
          decoded = await response.json();
        } catch {
          // A bounded status-only failure is still useful acceptance evidence.
        }
        return { status: response.status, body: decoded };
      };

      const setup = await request("/api/auth/setup", "POST", {
        pin: acceptedInput.pin,
      });
      if (setup.status !== 200) {
        return {
          setupStatus: setup.status,
          trialStatus: 0,
          trialState: null,
          searchStatus: 0,
          customerTotal: 0,
          secretStatus: 0,
          secretConfigured: false,
        };
      }

      const trial = acceptedInput.activateTrial
        ? await request("/api/license/trial", "POST")
        : { status: 200, body: { status: "not-requested" } };
      const search = await request(
        `/api/customers/search?q=${encodeURIComponent(acceptedInput.phone)}`,
      );
      const secret = await request("/api/secrets/gemini-key");
      return {
        setupStatus: setup.status,
        trialStatus: trial.status,
        trialState:
          typeof trial.body?.status === "string" ? trial.body.status : null,
        searchStatus: search.status,
        customerTotal: Number.isFinite(Number(search.body?.total))
          ? Number(search.body?.total)
          : 0,
        secretStatus: secret.status,
        secretConfigured: secret.body?.configured === true,
      };
    }, input);

    writeWireResult({ ok: true, result: validateResult(result) }, 0);
    return;
  } catch (error) {
    writeWireResult(
      {
        ok: false,
        stage,
        errorName: error instanceof Error ? error.name : "UnknownError",
        failureClass: failureClass(error),
      },
      2,
    );
  }
}

void main();
