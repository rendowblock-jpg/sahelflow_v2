import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Server-side integration helpers.
 *
 * This file is marked with `import "server-only"` — importing it from a client
 * component will produce a build error, which is the desired behavior: these
 * functions access credentials and must never run in the browser.
 *
 * Extracted from service.ts in PR #17 to fix a Turbopack build error: the
 * dynamic `await import("@/lib/supabase/server")` in service.ts was traced
 * into the client bundle because service.ts is imported by the integrations
 * page (a client component).
 */

/**
 * Fetches integration credentials by integration ID.
 *
 * Uses the admin (service-role) client to bypass RLS and retrieve the
 * credentials column. Must NEVER be called from client-side code.
 *
 * @returns The credentials object for the given integration, or null.
 */
export async function getIntegrationCredentials(
  integrationId: string,
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .select("credentials")
    .eq("id", integrationId)
    .single();
  if (error) throw error;
  return (data?.credentials as Record<string, unknown>) || null;
}

/**
 * Fetches integration credentials by platform name for a specific seller.
 *
 * Convenience wrapper — looks up the integration by (seller_id, platform),
 * then returns its credentials.
 */
export async function getCredentialsByPlatform(
  sellerId: string,
  platform: string,
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .select("credentials")
    .eq("seller_id", sellerId)
    .eq("platform", platform)
    .eq("is_active", true)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null; // no rows
    throw error;
  }
  return (data?.credentials as Record<string, unknown>) || null;
}
