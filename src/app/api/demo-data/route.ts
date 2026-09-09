import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";
import {
  getAlgerianDemoWorkspaceStatus,
  loadAlgerianDemoWorkspace,
  removeAlgerianDemoWorkspace,
} from "@/lib/demo/algerian-demo-lifecycle";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

export const GET = withErrorHandler(async () => {
  await requireAuth("settings.read");
  return NextResponse.json(await getAlgerianDemoWorkspaceStatus(), {
    headers: noStore,
  });
}, "GET /api/demo-data");

export const POST = withErrorHandler(async () => {
  await requireAuth(["settings.manage", "approvals.approve"]);
  // The demo assistant transcript speaks in SahelFlow's own voice, so it is
  // seeded in the seller's interface language (register L10N-02).
  const { locale } = await getI18n();
  return NextResponse.json(await loadAlgerianDemoWorkspace(undefined, locale), {
    status: 201,
    headers: noStore,
  });
}, "POST /api/demo-data");

export const DELETE = withErrorHandler(async () => {
  await requireAuth(["settings.manage", "approvals.approve"]);
  return NextResponse.json(await removeAlgerianDemoWorkspace(), {
    headers: noStore,
  });
}, "DELETE /api/demo-data");
