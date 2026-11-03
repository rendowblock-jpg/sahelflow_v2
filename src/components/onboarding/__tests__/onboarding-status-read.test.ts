import { describe, expect, it } from "vitest";

import { readSetupFlag } from "../onboarding-status-read";

// F-0012: the two reads behind the "couriers" and "AI" ticks need a PIN confirmation younger than 10 minutes.
// Past that window they answer 403 REAUTHENTICATION_REQUIRED. The checklist used to read that as "not configured".

const json = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;
const ok = (value: Response): PromiseSettledResult<Response> => ({ status: "fulfilled", value });
const failed = (): PromiseSettledResult<Response> => ({ status: "rejected", reason: new Error("offline") });
const pick = (body: unknown) => (body as { configured?: unknown }).configured === true;

describe("readSetupFlag", () => {
  it("reads true and false from an answered request", async () => {
    expect(await readSetupFlag(ok(json(200, { configured: true })), pick)).toEqual({ kind: "known", value: true });
    expect(await readSetupFlag(ok(json(200, { configured: false })), pick)).toEqual({ kind: "known", value: false });
  });

  it("says a PIN confirmation is needed when the answer is 403 REAUTHENTICATION_REQUIRED", async () => {
    const answer = ok(json(403, { code: "REAUTHENTICATION_REQUIRED", error: "Recent PIN verification is required" }));
    expect(await readSetupFlag(answer, pick)).toEqual({ kind: "needs-pin" });
  });

  it("does not mistake another 403 for a PIN request: it stays 'not configured' as before", async () => {
    expect(await readSetupFlag(ok(json(403, { code: "FORBIDDEN" })), pick)).toEqual({ kind: "known", value: false });
    expect(await readSetupFlag(ok(json(403, {})), pick)).toEqual({ kind: "known", value: false });
  });

  it("keeps the old behaviour for other failures: not configured", async () => {
    expect(await readSetupFlag(ok(json(500, { code: "INTERNAL" })), pick)).toEqual({ kind: "known", value: false });
    expect(await readSetupFlag(failed(), pick)).toEqual({ kind: "known", value: false });
  });

  it("copes with a 403 whose body is not JSON", async () => {
    const broken = { status: 403, ok: false, json: async () => { throw new Error("not json"); } } as unknown as Response;
    expect(await readSetupFlag(ok(broken), pick)).toEqual({ kind: "known", value: false });
  });
});
