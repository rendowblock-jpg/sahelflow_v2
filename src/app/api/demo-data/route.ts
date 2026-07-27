import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import {
  clearAlgerianDemoData,
  getAlgerianDemoStatus,
  seedAlgerianDemoData,
} from "@/lib/demo/algerian-demo";
import { finalizeAlgerianDemoStory } from "@/lib/demo/algerian-demo-story";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

async function countNonDemoOperationalRecords(): Promise<number> {
  const outsideDemo = { not: { startsWith: "demo-" } } as const;
  const counts = await Promise.all([
    db.category.count({ where: { id: outsideDemo } }),
    db.product.count({ where: { id: outsideDemo } }),
    db.customer.count({ where: { id: outsideDemo } }),
    db.order.count({ where: { id: outsideDemo } }),
    db.delivery.count({ where: { id: outsideDemo } }),
    db.return.count({ where: { id: outsideDemo } }),
    db.refund.count({ where: { id: outsideDemo } }),
    db.conversation.count({ where: { id: outsideDemo } }),
    db.message.count({ where: { id: outsideDemo } }),
    db.expense.count({ where: { id: outsideDemo } }),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export const GET = withErrorHandler(async () => {
  await requireAuth();
  return NextResponse.json(await getAlgerianDemoStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}, "GET /api/demo-data");

export const POST = withErrorHandler(async () => {
  await requireAuth();
  await seedAlgerianDemoData();
  await finalizeAlgerianDemoStory();
  return NextResponse.json(await getAlgerianDemoStatus(), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/demo-data");

export const DELETE = withErrorHandler(async () => {
  await requireAuth();
  const status = await getAlgerianDemoStatus();
  if (!status.loaded) {
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if ((await countNonDemoOperationalRecords()) > 0) {
    throw new SahelFlowError(
      "Demo removal is blocked because new non-demo operational records now exist. Export or move that work before removing the sample workspace.",
      "DEMO_REMOVAL_REAL_DATA_PRESENT",
      409,
    );
  }
  return NextResponse.json(await clearAlgerianDemoData(), {
    headers: { "Cache-Control": "no-store" },
  });
}, "DELETE /api/demo-data");
