import "server-only";

import type { DbClient } from "@/lib/db";

const LEGACY_TRIGGERS = new Set(["order_created", "low_stock", "order_pending"]);
const LEGACY_ACTIONS = new Set([
  "assign_priority",
  "notify_seller",
  "draft_whatsapp_reply",
]);

type DemoDefinition = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  conditions: unknown;
  steps: Array<{
    action: "send_whatsapp" | "tag_customer";
    onFailure: "stop";
    config: { messageTemplate?: string; noteText?: string };
  }>;
};

const DEFINITIONS: readonly DemoDefinition[] = [
  {
    id: "demo-automation-01",
    name: "Marquer les commandes à forte valeur",
    trigger: "order.created",
    action: "tag_customer",
    conditions: {
      all: [{ field: "totalPrice", operator: "greater_than", value: 7000 }],
    },
    steps: [
      {
        action: "tag_customer",
        onFailure: "stop",
        config: {
          noteText: "Commande COD à forte valeur {{orderNumber}} — {{totalPrice}} DZD",
        },
      },
    ],
  },
  {
    id: "demo-automation-02",
    name: "Suivi d’expédition WhatsApp",
    trigger: "order.shipped",
    action: "send_whatsapp",
    conditions: null,
    steps: [
      {
        action: "send_whatsapp",
        onFailure: "stop",
        config: {
          messageTemplate:
            "Votre commande {{orderNumber}} a été expédiée et est en route.",
        },
      },
    ],
  },
  {
    id: "demo-automation-03",
    name: "Remerciement après livraison",
    trigger: "order.delivered",
    action: "send_whatsapp",
    conditions: null,
    steps: [
      {
        action: "send_whatsapp",
        onFailure: "stop",
        config: {
          messageTemplate:
            "Merci pour votre confiance ! Nous espérons que votre commande {{orderNumber}} vous satisfait.",
        },
      },
    ],
  },
];

/**
 * One-time compatibility repair for the deterministic Founder demo rows that
 * predate the canonical durable automation contract.
 *
 * Only exact demo IDs with the known retired trigger/action vocabulary are
 * touched. Seller-created automations and demo rows that a seller has already
 * rebuilt are never rewritten. The replacement definitions intentionally use
 * only the current seller-ready event/action catalog; the old two-hour follow-up
 * sample is not faked because the durable engine does not yet own a state-aware
 * delay scheduler.
 */
export async function normalizeLegacyDemoAutomations(
  client: DbClient,
): Promise<number> {
  const rows = await client.automation.findMany({
    where: { id: { in: DEFINITIONS.map((definition) => definition.id) } },
    select: {
      id: true,
      trigger: true,
      action: true,
      dryRun: true,
    },
  });
  let repaired = 0;

  for (const row of rows) {
    if (!LEGACY_TRIGGERS.has(row.trigger) && !LEGACY_ACTIONS.has(row.action)) {
      continue;
    }
    const definition = DEFINITIONS.find((candidate) => candidate.id === row.id);
    if (!definition) continue;
    const first = definition.steps[0];
    if (!first) continue;

    await client.automation.update({
      where: { id: row.id },
      data: {
        name: definition.name,
        trigger: definition.trigger,
        action: definition.action,
        conditions: definition.conditions
          ? JSON.stringify(definition.conditions)
          : null,
        steps: JSON.stringify(definition.steps),
        config: JSON.stringify(first.config),
        dryRun: true,
        retryCount: 0,
        maxRetries: 2,
        retryDelayMs: 500,
        lastError: null,
        nextRunAt: null,
      },
    });
    repaired += 1;
  }

  return repaired;
}
