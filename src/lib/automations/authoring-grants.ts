import type { Phase2Action } from "@/lib/identity/permissions";

/**
 * Automation authoring must not be a way around the author's own grants
 * (INT-05). An automation runs later as the system principal, so the only
 * moment the author's permissions can be checked is when the definition is
 * written. `automations.manage` alone is not enough for a step whose effect the
 * author could not perform by hand:
 *
 * - `send_whatsapp` writes to a customer       -> `conversations.reply`
 * - `update_status` changes an order's status  -> `orders.update`
 *
 * The preset owner and manager roles hold all three, so nothing changes for
 * them. A custom narrowed policy (a manager who was deliberately denied
 * replying to customers) can no longer script that reply through an
 * automation. Steps with no outward effect (`send_notification`, `wait`,
 * `recheck_order_status`, `tag_customer`) need nothing extra.
 */
const STEP_EFFECT_GRANTS: Readonly<Record<string, Phase2Action>> = {
  send_whatsapp: "conversations.reply",
  update_status: "orders.update",
};

export function automationEffectGrants(
  steps: ReadonlyArray<Readonly<{ action: string }>>,
): readonly Phase2Action[] {
  const needed = new Set<Phase2Action>();
  for (const step of steps) {
    const grant = STEP_EFFECT_GRANTS[step.action];
    if (grant !== undefined) needed.add(grant);
  }
  return [...needed];
}

/**
 * `assertAction` is the caller's own check (`assertTrustedAction` bound to the
 * request's actor); it throws ACTION_FORBIDDEN for the first missing grant.
 */
export function assertAutomationEffectGrants(
  steps: ReadonlyArray<Readonly<{ action: string }>>,
  assertAction: (action: Phase2Action) => void,
): void {
  for (const action of automationEffectGrants(steps)) assertAction(action);
}
