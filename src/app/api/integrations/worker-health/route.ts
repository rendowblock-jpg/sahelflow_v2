import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getBackgroundWorkerHealth } from "@/lib/integrations/worker-health";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/worker-health
 *
 * The last tick of each background worker (commerce sync, automations, courier
 * outbox, Meta CAPI, Sheets bridge, storefront receipts): status, timestamps
 * and a failure CODE. Never a message, URL, host or customer value. In-memory
 * for this launch only; empty counters mean "no tick yet", not "healthy".
 */
export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  await requireAuth("integrations.read");
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    workers: getBackgroundWorkerHealth(),
  });
}, "GET /api/integrations/worker-health");
