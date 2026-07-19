import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress", "dhd"]),
});

/**
 * POST /api/delivery/test-connection — validate a delivery provider's
 * credentials without creating a shipment.
 *
 * W2-10 (DHD experimental): the integrations panel UI calls this endpoint
 * when the user clicks "Test connection" on a delivery card. Each adapter
 * can optionally implement `testConnection(creds)` — a lightweight call to
 * a low-cost endpoint (list wilayas, account info, ping). The endpoint
 * returns `{ ok: boolean, message: string }` so the UI can show a success
 * or failure toast with a useful, provider-specific message.
 *
 * Adapters that haven't implemented `testConnection` yet get a generic
 * "not implemented for this provider" response (so the UI can still
 * display a useful message rather than 404'ing).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = testSchema.parse(body);

  const adapter = getDeliveryAdapter(input.provider);
  const creds = await loadDeliveryCredentials(
    { prisma: db, shop: shopContext },
    input.provider,
  );

  if (!adapter.testConnection) {
    return NextResponse.json({
      ok: false,
      message: `Test connection is not implemented for "${adapter.name}" yet. Credentials were saved and will be validated on the next shipment.`,
    });
  }

  // Check for empty credentials up front so we surface a friendly message
  // instead of letting each adapter's "missing token" branch repeat itself.
  const hasAnyCred = Object.values(creds).some((v) => v && v.length > 0);
  if (!hasAnyCred) {
    return NextResponse.json({
      ok: false,
      message: `No ${adapter.name} credentials configured. Add them in Settings → Integrations first.`,
    });
  }

  const result = await adapter.testConnection(creds);
  return NextResponse.json(result);
}, "POST /api/delivery/test-connection");
