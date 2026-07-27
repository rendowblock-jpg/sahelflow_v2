import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  clearAlgerianDemoData,
  getAlgerianDemoStatus,
  seedAlgerianDemoData,
} from "@/lib/demo/algerian-demo";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAuth();
  return NextResponse.json(await getAlgerianDemoStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}, "GET /api/demo-data");

export const POST = withErrorHandler(async () => {
  await requireAuth();
  return NextResponse.json(await seedAlgerianDemoData(), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/demo-data");

export const DELETE = withErrorHandler(async () => {
  await requireAuth();
  return NextResponse.json(await clearAlgerianDemoData(), {
    headers: { "Cache-Control": "no-store" },
  });
}, "DELETE /api/demo-data");
