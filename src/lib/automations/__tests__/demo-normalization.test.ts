import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/lib/db";
import { normalizeLegacyDemoAutomations } from "../demo-normalization";

describe("normalizeLegacyDemoAutomations", () => {
  it("repairs only exact untouched legacy demo fingerprints", async () => {
    const rows = [
      {
        id: "demo-automation-01",
        name: "Prioriser les commandes WhatsApp à forte valeur",
        trigger: "order_created",
        action: "assign_priority",
        config: null,
        conditions: null,
        steps: null,
        dryRun: true,
      },
      {
        id: "demo-automation-02",
        name: "Alerte stock faible",
        trigger: "low_stock",
        action: "notify_seller",
        config: null,
        conditions: JSON.stringify({
          all: [{ field: "stockLevel", operator: "less_than", value: 3 }],
        }),
        steps: null,
        dryRun: true,
      },
      {
        id: "demo-automation-03",
        name: "Relance confirmation après 2 heures",
        trigger: "order_pending",
        action: "draft_whatsapp_reply",
        config: null,
        conditions: null,
        steps: null,
        dryRun: true,
      },
    ];
    const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const client = {
      automation: {
        findMany: vi.fn().mockResolvedValue(rows),
        update: vi.fn().mockImplementation(async (args) => {
          updates.push(args);
          return args.data;
        }),
      },
    } as unknown as DbClient;

    await expect(normalizeLegacyDemoAutomations(client)).resolves.toBe(2);

    expect(updates.map((update) => update.where.id)).toEqual([
      "demo-automation-01",
      "demo-automation-03",
    ]);
    expect(updates[0]?.data).toMatchObject({
      name: "Marquer les commandes à forte valeur",
      trigger: "order.created",
      action: "tag_customer",
    });
    expect(updates[1]?.data).toMatchObject({
      name: "Remerciement après livraison",
      trigger: "order.delivered",
      action: "send_whatsapp",
    });
  });

  it("preserves renamed or functionally customized demo rows byte-for-byte", async () => {
    const rows = [
      {
        id: "demo-automation-01",
        name: "Ma règle VIP personnalisée",
        trigger: "order_created",
        action: "assign_priority",
        config: null,
        conditions: null,
        steps: null,
        dryRun: true,
      },
      {
        id: "demo-automation-02",
        name: "Alerte stock faible",
        trigger: "low_stock",
        action: "notify_seller",
        config: JSON.stringify({ channel: "owner" }),
        conditions: null,
        steps: null,
        dryRun: true,
      },
    ];
    const client = {
      automation: {
        findMany: vi.fn().mockResolvedValue(rows),
        update: vi.fn(),
      },
    } as unknown as DbClient;

    await expect(normalizeLegacyDemoAutomations(client)).resolves.toBe(0);
    expect(client.automation.update).not.toHaveBeenCalled();
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
        update: vi.fn(),
      },
    } as unknown as DbClient;

    await expect(normalizeLegacyDemoAutomations(client)).resolves.toBe(0);
    expect(client.automation.update).not.toHaveBeenCalled();
  });
});
