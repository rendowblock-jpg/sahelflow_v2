// F-0027 round 2. describeIngressHealth carries payload.ingress.spool.lastFailureCode
// into the "waiting" and "stalled" notices (and only those). Pure function, no
// stand-ins. The field is ABSENT, not null, when there is no usable code, so the
// older exact-shape tests of this function keep their meaning.
import { describe, expect, it } from "vitest";

import { describeIngressHealth } from "../use-inbox-ingress-health";

function status(spool: Record<string, unknown>, lost: Record<string, unknown> = {}) {
  return {
    status: "connected",
    ingress: {
      spool: { pending: 0, oldestPendingSec: null, stuck: 0, ...spool },
      lost: { sinceStart: { spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 0, ...lost } },
    },
  };
}

const notices = (payload: unknown) => describeIngressHealth(payload, false).notices;

describe("lastFailureCode in the notices", () => {
  it("is carried into a waiting notice", () => {
    expect(
      notices(status({ pending: 127, oldestPendingSec: 3209 * 60, lastFailureCode: "APP_INGRESS_TIMEOUT" })),
    ).toEqual([
      { kind: "waiting", count: 127, minutes: 3209, failureCode: "APP_INGRESS_TIMEOUT" },
    ]);
  });

  it("is carried into a stalled notice", () => {
    expect(notices(status({ pending: 4, stuck: 2, lastFailureCode: "HTTP_401" }))).toEqual([
      { kind: "stalled", count: 4, minutes: null, failureCode: "HTTP_401" },
    ]);
  });

  it("keeps a code the app has never heard of", () => {
    expect(
      notices(status({ pending: 2, oldestPendingSec: 900, lastFailureCode: "SOMETHING_NEW" })),
    ).toEqual([{ kind: "waiting", count: 2, minutes: 15, failureCode: "SOMETHING_NEW" }]);
  });

  it("leaves the field out (not null) when the code is null, missing or not a short token", () => {
    for (const lastFailureCode of [null, undefined, "", 42, {}, "has space", "+213 791 99 91 57", "x".repeat(129)]) {
      const [notice] = notices(status({ pending: 2, oldestPendingSec: 900, lastFailureCode }));
      expect(notice).toEqual({ kind: "waiting", count: 2, minutes: 15 });
      expect(notice).not.toHaveProperty("failureCode");
    }
    const [noKey] = notices(status({ pending: 2, oldestPendingSec: 900 }));
    expect(noKey).not.toHaveProperty("failureCode");
  });

  it("does not hang the code on the red 'lost' notice or the 'unsupported' one", () => {
    const result = notices(
      status(
        { pending: 0, lastFailureCode: "APP_INGRESS_TIMEOUT" },
        { spoolFailed: 2, unsupportedChat: 3 },
      ),
    );
    expect(result).toEqual([
      { kind: "lost", count: 2, minutes: null },
      { kind: "unsupported", count: 3, minutes: null },
    ]);
  });

  it("does not turn a code into a notice: nothing waiting means no notice", () => {
    expect(notices(status({ pending: 0, lastFailureCode: "APP_INGRESS_TIMEOUT" }))).toEqual([]);
    // Below the 10 minute line a backlog is not news yet, code or not.
    expect(notices(status({ pending: 3, oldestPendingSec: 300, lastFailureCode: "HTTP_503" }))).toEqual([]);
  });
});
