import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/lib/db";
import { normalizeLegacyDemoAutomations } from "../demo-normalization";

describe("normalizeLegacyDemoAutomations", () => {
  it("repairs only known demo rows that still carry retired trigger/action vocabulary", async () => {
    const rows = [
      {
        id: "demo-automation-01",
        trigger: "order_created",
        action: "assign_priority",
        dryRun: true,
      },
      {
        id: "demo-automation-02",
        trigger: "order.shipped",
        action: "send_whatsapp",
        dryRun: true,
      },
      {
        id: "demo-automation-03",
        trigger: "order_pending",
        action: "draft_whatsapp_reply",
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
      trigger: "order.created",
      action: "tag_customer",
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });
    expect(updates[1]?.data).toMatchObject({
      trigger: "order.delivered",
      action: "send_whatsapp",
      dryRun: true,
    });
  });

  it("is idempotent once the exact demo rows already use the canonical contract", async () => {
    const client = {
      automation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "demo-automation-01",
            trigger: "order.created",
            action: "tag_customer",
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
