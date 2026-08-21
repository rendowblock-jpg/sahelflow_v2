import "server-only";

import type { DbClient } from "@/lib/db";

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

type LegacyDemoFingerprint = {
  name: string;
  trigger: string;
  action: string;
  config: string | null;
  conditions: string | null;
  steps: string | null;
  dryRun: boolean;
};

// Exact seller-definition fields emitted by src/lib/demo/algerian-demo.ts.
// Operational counters/timestamps are intentionally excluded: they may change
// as the demo is exercised without meaning the seller customized the rule.
const LEGACY_FINGERPRINTS: Readonly<Record<string, LegacyDemoFingerprint>> = {
  "demo-automation-01": {
    name: "Prioriser les commandes WhatsApp à forte valeur",
    trigger: "order_created",
    action: "assign_priority",
    conditions: JSON.stringify({
      all: [
        { field: "source", op: "equal", value: "whatsapp" },
        { field: "totalPrice", op: "greater_than", value: 7000 },
      ],
    }),
    config: JSON.stringify({ priority: "high" }),
    steps: null,
    dryRun: true,
  },
  "demo-automation-02": {
    name: "Alerte stock faible",
    trigger: "low_stock",
    action: "notify_seller",
    conditions: JSON.stringify({
      all: [{ field: "available", op: "less_than_or_equal", value: 8 }],
    }),
    config: null,
    steps: null,
    dryRun: true,
  },
  "demo-automation-03": {
    name: "Relance confirmation après 2 heures",
    trigger: "order_pending",
    action: "draft_whatsapp_reply",
    conditions: null,
    config: JSON.stringify({
      template: "demo_relance_confirmation",
      delayMinutes: 120,
    }),
    steps: null,
    dryRun: true,
  },
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

function isUntouchedLegacyDemo(row: {
  id: string;
  name: string;
  trigger: string;
  action: string;
  config: string | null;
  conditions: string | null;
  steps: string | null;
  dryRun: boolean;
}): boolean {
  const fingerprint = LEGACY_FINGERPRINTS[row.id];
  if (!fingerprint) return false;

  // Fail closed. Every seller-editable definition field must still match the
  // canonical demo seed. A rename, condition/config/step change, trigger/action
  // edit or dry-run change makes the row ineligible and preserves it verbatim.
  return (
    row.name === fingerprint.name &&
    row.trigger === fingerprint.trigger &&
    row.action === fingerprint.action &&
    row.config === fingerprint.config &&
    row.conditions === fingerprint.conditions &&
    row.steps === fingerprint.steps &&
    row.dryRun === fingerprint.dryRun
  );
}

/**
 * One-time compatibility repair for the deterministic Founder demo rows that
 * predate the canonical durable automation contract.
 *
 * The repair is deliberately fail-closed: an exact seed ID alone is never
 * sufficient. The complete legacy seller-definition fingerprint must still be
 * intact. Operational state such as run counters, active state and timestamps
 * is preserved, while any seller customization makes the row ineligible.
 *
 * The write itself repeats the full fingerprint as a compare-and-swap guard so
 * a concurrent seller edit between the initial read and update is preserved.
 *
 * Replacement definitions use only the current seller-ready event/action
 * catalog. The old two-hour follow-up sample is not faked because the durable
 * engine does not yet own a state-aware delay scheduler.
 */
export async function normalizeLegacyDemoAutomations(
  client: DbClient,
): Promise<number> {
  const rows = await client.automation.findMany({
    where: { id: { in: DEFINITIONS.map((definition) => definition.id) } },
    select: {
      id: true,
      name: true,
      trigger: true,
      action: true,
      config: true,
      conditions: true,
      steps: true,
      dryRun: true,
    },
  });
  let repaired = 0;

  for (const row of rows) {
    if (!isUntouchedLegacyDemo(row)) continue;

    const definition = DEFINITIONS.find((candidate) => candidate.id === row.id);
    const fingerprint = LEGACY_FINGERPRINTS[row.id];
    if (!definition || !fingerprint) continue;
    const first = definition.steps[0];
    if (!first) continue;

    const updated = await client.automation.updateMany({
      where: {
        id: row.id,
        name: fingerprint.name,
        trigger: fingerprint.trigger,
        action: fingerprint.action,
        config: fingerprint.config,
        conditions: fingerprint.conditions,
        steps: fingerprint.steps,
        dryRun: fingerprint.dryRun,
      },
      data: {
        name: definition.name,
        trigger: definition.trigger,
        action: definition.action,
        conditions: definition.conditions
          ? JSON.stringify(definition.conditions)
          : null,
        steps: JSON.stringify(definition.steps),
        config: JSON.stringify(first.config),
        lastError: null,
        nextRunAt: null,
      },
    });
    repaired += updated.count;
  }

  return repaired;
}
