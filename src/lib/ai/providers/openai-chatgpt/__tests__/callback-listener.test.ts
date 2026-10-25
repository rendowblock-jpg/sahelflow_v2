// @vitest-environment node
import net from "node:net";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCallbackListener, type CallbackListener } from "../callback-listener";

// Real loopback sockets on 127.0.0.1 only; no other network. The code and state below are fake.
const STATE = "state-AAAA-1111";
const CODE = "code-BBBB-2222";
const open: CallbackListener[] = [];

async function start(overrides: Partial<Parameters<typeof startCallbackListener>[0]> = {}) {
  const listener = await startCallbackListener({ ports: [0], timeoutMs: 600_000, expectedState: STATE, ...overrides });
  open.push(listener);
  return listener;
}
const url = (listener: CallbackListener, query: string) => `${listener.redirectUri}?${query}`;
const pending = (p: Promise<unknown>) => Promise.race([p.then(() => "settled"), new Promise((r) => setTimeout(() => r("waiting"), 60))]);

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  while (open.length) await open.pop()!.close();
});

describe("callback listener", () => {
  it("accepts the right state, returns the code and the issued client id, then closes", async () => {
    const l = await start();
    const res = await fetch(url(l, `code=${CODE}&state=${STATE}&client_id=oaiapp_123&scope=openid`));
    expect(res.status).toBe(200);
    await expect(l.result).resolves.toEqual({ code: CODE, issuedClientId: "oaiapp_123" });
    // closed right after the first valid callback
    await expect(fetch(url(l, `code=other&state=${STATE}`))).rejects.toThrow();
  });

  it("answers a wrong or missing state with 404, no echo, and keeps waiting", async () => {
    const l = await start();
    for (const query of ["code=x&state=nope", "code=x", `state=${STATE}x&code=x`, "state=&code=x"]) {
      const res = await fetch(url(l, query));
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).not.toContain("nope");
      expect(text).not.toContain(CODE);
    }
    expect(await pending(l.result)).toBe("waiting");
    const ok = await fetch(url(l, `code=${CODE}&state=${STATE}`));
    expect(ok.status).toBe(200);
    await expect(l.result).resolves.toEqual({ code: CODE });
  });

  it("answers any other path or method with 404", async () => {
    const l = await start();
    const origin = new URL(l.redirectUri).origin;
    expect((await fetch(`${origin}/callback?code=x&state=${STATE}`)).status).toBe(404);
    expect((await fetch(`${origin}/`)).status).toBe(404);
    expect((await fetch(`${origin}/auth/callback/extra?state=${STATE}&code=x`)).status).toBe(404);
    expect((await fetch(l.redirectUri, { method: "POST", body: `state=${STATE}&code=x` })).status).toBe(404);
    expect(await pending(l.result)).toBe("waiting");
  });

  it("an error callback with the right state ends the attempt with that error, and never shows it", async () => {
    const l = await start();
    const res = await fetch(url(l, `error=access_denied&state=${STATE}`));
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("access_denied");
    await expect(l.result).resolves.toEqual({ error: "access_denied" });
  });

  it("an error callback with a wrong state is ignored", async () => {
    const l = await start();
    expect((await fetch(url(l, "error=access_denied&state=wrong"))).status).toBe(404);
    expect(await pending(l.result)).toBe("waiting");
  });

  it("a valid state with no code and no error is an error, not a hang", async () => {
    const l = await start();
    await fetch(url(l, `state=${STATE}`));
    await expect(l.result).resolves.toEqual({ error: "missing_code" });
  });

  it("binds 127.0.0.1 only: the listen call names it, ::1 and a LAN address are refused", async () => {
    const listen = vi.spyOn(net.Server.prototype, "listen");
    const l = await start();
    const port = Number(new URL(l.redirectUri).port);
    expect(l.redirectUri).toBe(`http://127.0.0.1:${port}/auth/callback`);
    const hosts = listen.mock.calls.map((call) => (call[0] as { host?: string })?.host ?? call[1]);
    expect(hosts).toContain("127.0.0.1");
    expect(hosts.every((h) => h === "127.0.0.1")).toBe(true);
    const refused = (host: string) => new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port });
      socket.once("connect", () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(true));
    });
    expect(await refused("::1")).toBe(true);
    const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);
    if (lan) expect(await refused(lan.address)).toBe(true);
  });

  it("uses the documented port when free, and another free port when it is taken", async () => {
    const probe = net.createServer();
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    const free = (probe.address() as net.AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    const first = await start({ ports: [free, 0] });
    expect(new URL(first.redirectUri).port).toBe(String(free));
    // The same port is now busy: a listener cannot take it, but the fallback 0 works.
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    const busy = (blocker.address() as net.AddressInfo).port;
    try {
      const second = await start({ ports: [busy, 0] });
      expect(new URL(second.redirectUri).port).not.toBe(String(busy));
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()));
    }
  });

  it("fails with a coded error when no port can be bound", async () => {
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    const busy = (blocker.address() as net.AddressInfo).port;
    try {
      await expect(startCallbackListener({ ports: [busy], timeoutMs: 1000, expectedState: STATE })).rejects.toMatchObject({ code: "OPENAI_NETWORK_ERROR" });
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()));
    }
  });

  it("times out: the result is { error: 'timeout' } and the socket is gone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const l = await start({ timeoutMs: 600_000 });
    await vi.advanceTimersByTimeAsync(599_999);
    expect(await Promise.race([l.result.then(() => "settled"), Promise.resolve("waiting")])).toBe("waiting");
    await vi.advanceTimersByTimeAsync(2);
    await expect(l.result).resolves.toEqual({ error: "timeout" });
    vi.useRealTimers();
    await expect(fetch(url(l, `code=${CODE}&state=${STATE}`))).rejects.toThrow();
  });

  it("starting a second listener closes the first, whose result becomes { error: 'superseded' }", async () => {
    const first = await start();
    const second = await start();
    await expect(first.result).resolves.toEqual({ error: "superseded" });
    await expect(fetch(url(first, `code=${CODE}&state=${STATE}`))).rejects.toThrow();
    expect(await pending(second.result)).toBe("waiting");
    expect((await fetch(url(second, `code=${CODE}&state=${STATE}`))).status).toBe(200);
    await expect(second.result).resolves.toEqual({ code: CODE });
  });

  it("close() ends the wait with { error: 'closed' } and is safe to call twice", async () => {
    const l = await start();
    await l.close();
    await l.close();
    await expect(l.result).resolves.toEqual({ error: "closed" });
  });

  it("the page is static, localized from Accept-Language, safe, and never holds the code or state", async () => {
    const pages: Record<string, { lang: string; dir: string; text: RegExp }> = {
      "ar,en;q=0.5": { lang: "ar", dir: "rtl", text: /SahelFlow/ },
      "fr-FR,fr;q=0.9": { lang: "fr", dir: "ltr", text: /fermer cet onglet/ },
      "en-US,en;q=0.9": { lang: "en", dir: "ltr", text: /close this tab and go back to SahelFlow/ },
      "de": { lang: "fr", dir: "ltr", text: /fermer cet onglet/ },
    };
    for (const [header, expected] of Object.entries(pages)) {
      const l = await start();
      const res = await fetch(url(l, `code=${CODE}&state=${STATE}&client_id=oaiapp_9`), { headers: { "Accept-Language": header } });
      const html = await res.text();
      expect(res.headers.get("content-type")).toMatch(/^text\/html; charset=utf-8/i);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("script-src");
      expect(html).toContain(`lang="${expected.lang}"`);
      expect(html).toContain(`dir="${expected.dir}"`);
      expect(html).toMatch(expected.text);
      expect(html).not.toContain(CODE);
      expect(html).not.toContain(STATE);
      expect(html).not.toContain("oaiapp_9");
      expect(html).not.toMatch(/<script/i);
      await l.result;
    }
  });
});
