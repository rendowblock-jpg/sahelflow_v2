import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const serviceWorkerSource = readFileSync(
  new URL("../../../../public/sw.js", import.meta.url),
  "utf8",
);

interface HeaderBag {
  get(name: string): string | null;
  has(name: string): boolean;
}

function headers(values: Record<string, string> = {}): HeaderBag {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
    has(name) {
      return normalized.has(name.toLowerCase());
    },
  };
}

function policyContext() {
  const context = vm.createContext({
    URL,
    Set,
    self: {
      addEventListener: () => undefined,
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
      location: { origin: "http://localhost:3000" },
    },
  });
  vm.runInContext(serviceWorkerSource, context);
  return context;
}

function nextRouterDecision(
  context: vm.Context,
  request: {
    url: string;
    mode: string;
    destination: string;
    headers: HeaderBag;
  },
): boolean {
  Object.assign(context, { request });
  return Boolean(
    vm.runInContext(
      "isNextRouterRequest(request, new URL(request.url))",
      context,
    ),
  );
}

function staticAssetDecision(
  context: vm.Context,
  request: {
    url: string;
    mode: string;
    destination: string;
    headers: HeaderBag;
  },
): boolean {
  Object.assign(context, { request });
  return Boolean(
    vm.runInContext(
      "isStaticAssetRequest(request, new URL(request.url))",
      context,
    ),
  );
}

describe("browser service-worker route policy", () => {
  it("keeps Next navigation, RSC and prefetch transport out of stale caches", () => {
    const context = policyContext();
    const base = {
      mode: "cors",
      destination: "",
      headers: headers(),
    };

    expect(
      nextRouterDecision(context, {
        ...base,
        url: "http://localhost:3000/dashboard?_rsc=abc",
      }),
    ).toBe(true);
    expect(
      nextRouterDecision(context, {
        ...base,
        url: "http://localhost:3000/orders",
        headers: headers({ RSC: "1" }),
      }),
    ).toBe(true);
    expect(
      nextRouterDecision(context, {
        ...base,
        url: "http://localhost:3000/customers",
        headers: headers({ "Next-Router-Prefetch": "1" }),
      }),
    ).toBe(true);
    expect(
      nextRouterDecision(context, {
        ...base,
        url: "http://localhost:3000/products",
        mode: "navigate",
      }),
    ).toBe(true);
  });

  it("limits stale-while-revalidate to static presentation assets", () => {
    const context = policyContext();

    expect(
      staticAssetDecision(context, {
        url: "http://localhost:3000/_next/static/chunks/app.js",
        mode: "cors",
        destination: "script",
        headers: headers(),
      }),
    ).toBe(true);
    expect(
      staticAssetDecision(context, {
        url: "http://localhost:3000/dashboard?_rsc=abc",
        mode: "cors",
        destination: "",
        headers: headers({ RSC: "1" }),
      }),
    ).toBe(false);
  });
});
