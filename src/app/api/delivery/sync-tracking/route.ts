import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDeliveryAdapter } from "@/lib/delivery/adapters";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Rate limit cron endpoint
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const rl = rateLimit(`sync-tracking:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.log(JSON.stringify({ type: "sync_tracking", action: "config_missing", message: "CRON_SECRET is not configured — rejecting all requests for safety" }));
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: deliveries } = await supabase
    .from("deliveries")
    .select("id, order_id, seller_id, provider, tracking_number, status")
    .in("status", ["created", "picked_up", "in_transit"])
    .limit(200);

  if (!deliveries || deliveries.length === 0) {
    return NextResponse.json({
      synced: 0,
      message: "No active deliveries to sync",
    });
  }

  const byProvider = new Map<string, typeof deliveries>();
  for (const d of deliveries) {
    const list = byProvider.get(d.provider) || [];
    list.push(d);
    byProvider.set(d.provider, list);
  }

  let synced = 0;
  let errors = 0;

  for (const [provider, providerDeliveries] of byProvider) {
    const adapter = getDeliveryAdapter(provider);
    if (!adapter) continue;

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials")
      .eq("platform", provider)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!integration) continue;

    for (const delivery of providerDeliveries) {
      if (!delivery.tracking_number) continue;

      try {
        const tracking = await adapter.getTracking(
          delivery.tracking_number,
          integration.credentials as Record<string, unknown>,
        );
        const newStatus = tracking.status;

        if (newStatus && newStatus !== delivery.status) {
          await supabase
            .from("deliveries")
            .update({ status: newStatus, last_sync: new Date().toISOString() })
            .eq("id", delivery.id);

          if (newStatus === "delivered" || newStatus === "returned") {
            const orderStatus =
              newStatus === "delivered" ? "delivered" : "returned";
            await supabase.rpc("atomic_update_order_status", {
              p_order_id: delivery.order_id,
              p_new_status: orderStatus,
            });
          }

          synced++;
        } else {
          await supabase
            .from("deliveries")
            .update({ last_sync: new Date().toISOString() })
            .eq("id", delivery.id);
        }
      } catch (err) {
        console.log(JSON.stringify({
          type: "sync_tracking",
          action: "tracking_error",
          trackingNumber: delivery.tracking_number,
          error: err instanceof Error ? err.message : String(err),
        }));
        errors++;
      }

      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return NextResponse.json({ synced, errors, total: deliveries.length });
}
