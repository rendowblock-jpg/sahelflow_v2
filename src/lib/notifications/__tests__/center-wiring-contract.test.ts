import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nativeDeliverySchema } from "../contracts";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const center = source("src/lib/notifications/notification-center.ts");
const hook = source("src/hooks/use-notification-center.ts");

describe("centre wiring (source contract, like the repo's other notification contract)", () => {
  it("a claim without a preference row answers 'disabled' instead of a 500 (A9)", () => {
    expect(center).not.toContain("findUniqueOrThrow");
    expect(center).toContain('if (!preference) return { deliver: false, reasonCode: "disabled" };');
  });
  it("quiet hours HOLD the row (state held) so one summary can follow; they do not close it", () => {
    expect(center).toContain('suppressed === "quiet-hours"');
    expect(center).toContain('update: { state: "held", reasonCode: "quiet-hours" }');
    expect(center).toContain("planDigest(");
  });
  it("projection takes orders, settings and conversations events, each with its own wording", () => {
    expect(center).toContain("requiredAction: { in: allowedActions }");
    expect(center).toContain("wordingFor(event.eventType).titleKey");
    expect(center).toContain("resolveLiveEventState(db, row.event, now)");
  });
  it("the hook lets ONE toast per kind through, after the foreground check and before the toast", () => {
    const foreground = hook.indexOf('"foreground"');
    const gate = hook.indexOf("nativeBurstGate.take(");
    const send = hook.indexOf("await sendDesktopNotification(");
    expect(hook).toContain("if (!nativeBurstGate.take(");
    expect(hook).toContain('completeNative(notification.id, "suppressed", "burst")');
    expect(foreground).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(foreground);
    expect(send).toBeGreaterThan(gate);
  });
  it("burst and digest are accepted closing reasons", () => {
    for (const reasonCode of ["burst", "digest"]) {
      expect(nativeDeliverySchema.safeParse({ action: "complete", state: "suppressed", reasonCode }).success).toBe(true);
    }
  });
  it("WhatsApp marker key is per conversation per 5 minutes: one import, one line", () => {
    const inbound = source("src/lib/whatsapp/inbound-processor.ts");
    expect(inbound).toContain('buildEventKey({ kind: "whatsapp.received", at: storedAt, subject: conversation.id })');
    expect(inbound).not.toContain("whatsapp-message-received:${claim.ingressKey}");
  });
  it("emit call-sites: one import and one call each, inside the transaction", () => {
    const order = source("src/lib/orders/canonical-source-order.ts");
    expect(order.split("emitNotificationEvent").length - 1).toBe(2);
    expect(order.indexOf("emitNotificationEvent(tx")).toBeGreaterThan(order.indexOf("await tx.order.create"));
    const courier = source("src/lib/delivery/canonical-courier.ts");
    expect(courier.split("emitNotificationEvent").length - 1).toBe(2);
    expect(courier.indexOf("emitNotificationEvent(tx")).toBeGreaterThan(courier.indexOf('data: { status: "booking_failed" }'));
  });
});
