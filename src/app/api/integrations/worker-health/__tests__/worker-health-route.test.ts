/**
 * GET /api/integrations/worker-health (INT-10): status and failure CODES of the
 * background workers, for a signed-in member who may read integrations.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";

const harness = vi.hoisted(() => ({ requireAuth: vi.fn() }));

vi.mock("@/lib/auth/server", () => ({ requireAuth: harness.requireAuth }));

import {
  __resetBackgroundWorkerHealthForTests,
  recordWorkerFailure,
} from "@/lib/integrations/worker-health";
import { GET } from "../route";

const call = () => (GET as unknown as (request: Request) => Promise<Response>)(
  new Request("http://localhost/api/integrations/worker-health"),
);

describe("GET /api/integrations/worker-health", () => {
  beforeEach(() => {
    harness.requireAuth.mockReset();
    harness.requireAuth.mockResolvedValue(undefined);
    __resetBackgroundWorkerHealthForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("requires integrations.read before it says anything", async () => {
    harness.requireAuth.mockRejectedValueOnce(new SahelFlowError("nope", "ACTION_FORBIDDEN", 403));
    const response = await call();
    expect(response.status).toBe(403);
    expect(harness.requireAuth).toHaveBeenCalledWith("integrations.read");
  });

  it("returns every worker with a code and no message, URL or customer value", async () => {
    recordWorkerFailure(
      "commerce-sync",
      new SahelFlowError("Bearer abc123SECRET https://user:pw@192.168.0.7/x Amina", "LICENSE_EXPIRED", 403),
    );
    recordWorkerFailure("automations", new Error("Bearer abc123SECRET https://user:pw@192.168.0.7/x Amina"));
    const response = await call();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { workers: Array<Record<string, unknown>> };
    expect(body.workers).toHaveLength(6);
    expect(body.workers.find((w) => w.worker === "commerce-sync")).toMatchObject({
      status: "failing",
      lastFailureCode: "LICENSE_EXPIRED",
    });
    expect(body.workers.find((w) => w.worker === "automations")).toMatchObject({
      lastFailureCode: "UNCLASSIFIED",
    });
    const text = JSON.stringify(body);
    for (const secret of ["abc123SECRET", "user:pw", "192.168.0.7", "Amina"]) {
      expect(text).not.toContain(secret);
    }
  });
});
