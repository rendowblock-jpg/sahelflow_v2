import { NextResponse } from "next/server";
import { agentConfigSchema } from "@/lib/validation";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

/**
 * GET/POST /api/agents/config
 * GET: Fetch seller's agent configuration
 * POST: Update seller's agent configuration
 */
export const GET = withAuthAndRateLimit(async (req, { user, supabase }) => {
  const { data: seller } = await supabase
    .from("sellers")
    .select("settings")
    .eq("id", user.id)
    .single();

  const settings = seller?.settings as Record<string, unknown> | null;
  const agentConfig = settings?.agent_config || {
    order: {
      enabled: true,
      auto_confirm_threshold: 30,
      auto_reject_threshold: 85,
      require_full_address: true,
    },
    comm: {
      enabled: true,
      auto_extract: true,
      suggest_replies: true,
      auto_send: false,
      language_preference: "auto",
    },
  };

  return NextResponse.json(agentConfig);
});

export const POST = withAuthAndRateLimit(
  async (req, { user, supabase, body }) => {
    // Body is automatically validated and typed by the wrapper
    const agentConfig = body!.agent_config;

    // Fetch current settings and merge
    const { data: seller } = await supabase
      .from("sellers")
      .select("settings")
      .eq("id", user.id)
      .single();

    const currentSettings = (seller?.settings as Record<string, unknown>) || {};

    const { error } = await supabase
      .from("sellers")
      .update({
        settings: {
          ...currentSettings,
          agent_config: agentConfig,
        },
      })
      .eq("id", user.id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  },
  {
    schema: agentConfigSchema,
    rateLimitConfig: { maxRequests: 20, windowMs: 60000 },
  },
);
