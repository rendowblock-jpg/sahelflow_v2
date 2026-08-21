import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/lib/db";
import { normalizeLegacyDemoAutomations } from "../demo-normalization";

const seededDemo01 = {
  id: "demo-automation-01",
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
};

const seededDemo02 = {
  id: "demo-automation-02",
  name: "Alerte stock faible",
  trigger: "low_stock",
  action: "notify_seller",
  conditions: JSON.stringify({
    all: [{ field: "available", op: "less_than_or_equal", value: 8 }],
  }),
  config: null,
  steps: null,
  dryRun: true,
};

const seededDemo03 = {
  id: "demo-automation-03",
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
};

describe("normalizeLegacyDemoAutomations", () => {
  it("repairs the exact untouched Founder demo seed with compare-and-swap writes", async () => {
    const updates: Array<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }> = [];
    const client = {
      automation: {
        findMany: vi.fn().mockResolvedValue([
          seededDemo01,
          seededDemo02,
          seededDemo03,
        ]),
        updateMany: vi.fn().mockImplementation(async (args) => {
          updates.push(args);
          return { count: 1 };
        }),
      },
    } as unknown as DbClient;

    await expect(normalizeLegacyDemoAutomations(client)).resolves.toBe(3);

    expect(updates.map((update) => update.where.id)).toEqual([
      "demo-automation-01",
      "demo-automation-02",
      "demo-automation-03",
    ]);
    expect(updates[0]?.where).toMatchObject(seededDemo01);
    expect(updates[1]?.where).toMatchObject(seededDemo02);
    expect(updates[2]?.where).toMatchObject(seededDemo03);
    expect(updates[0]?.data).toMatchObject({
      name: "Marquer les commandes à forte valeur",
      trigger: "order.created",
      action: "tag_customer",
    });
    expect(updates[1]?.data).toMatchObject({
      name: "Suivi d’expédition WhatsApp",
      trigger: "order.shipped",
      action: "send_whatsapp",
    });
    expect(updates[2]?.data).toMatchObject({
      name: "Remerciement après livraison",
      trigger: "order.delivered",
      action: "send_whatsapp",
    });
  });

  it("preserves renamed or functionally customized demo rows byte-for-byte", async () => {
    const client = {
      automation: {
        findMany: vi.fn().mockResolvedValue([
          { ...seededDemo01, name: "Ma règle VIP personnalisée" },
          {
            ...seededDemo02,
            conditions: JSON.stringify({
              all: [{ field: "available", op: "less_than_or_equal", value: 3 }],
            }),
          },
          {
            ...seededDemo03,
            config: JSON.stringify({
              template: "mon_modele",
              delayMinutes: 90,
            }),
          },
        ]),
        updateMany: vi.fn(),
      },
    } as unknown as DbClient;

    await expect(normalizeLegacyDemoAutomations(client)).resolves.toBe(0);
    expect(client.automation.updateMany).not.toHaveBeenCalled();
  });

  it("preserves a concurrent seller edit that lands after the fingerprint read", async () => {
    const client = {
      automation: {
        findMany: vi.fn().mockResolvedValue([seededDemo01]),
        // A zero-count compare-and-swap means one of the fingerprint fields no
        // longer matches: the seller won the race and their edit is preserved.
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as DbClient;

    await expect(normalizeLegacyDemoAutomations(client)).resolves.toBe(0);
    expect(client.automation.updateMany).toHaveBeenCalledTimes(1);
  });

  it("is idempotent once an exact demo row already uses the canonical contract", async () => {
    const client = {
      automation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "demo-automation-01",
            name: "Marquer les commandes à forte valeur",
            trigger: "order.created",
            action: "tag_customer",
            config: JSON.stringify({ noteText: "Order {{orderNumber}}" }),
            conditions: null,
            steps: JSON.stringify([]),
            dryRun: true,
          },
        ]),
        updateMany: vi.fn(),
      },
    } as unknown as DbClient;

    await expect(normalizeLegacyDemoAutomations(client)).resolves.toBe(0);
    expect(client.automation.updateMany).not.toHaveBeenCalled();
  });
});
