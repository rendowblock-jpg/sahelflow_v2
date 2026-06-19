import { NextResponse } from "next/server";

import {
  extractOrderFromMessage,
  askSellerAssistant,
  generateReplySuggestions,
} from "@/lib/ai/service";
import { executeAgent, AgentStep } from "@/lib/ai/agent";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { aiRequestSchema } from "@/lib/validation";

// Allow up to 30 seconds for AI agent execution (tool calls + 2 LLM round-trips)
// llama-4-scout responds in 1-2s per call, so 30s is generous for multi-tool chains
export const maxDuration = 30;

// Sanitize input — strip dangerous content
function sanitize(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 4000); // Max 4k chars
}

export async function POST(request: Request) {
  try {
    // Authentication — reject anonymous requests before any AI work
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { getUserSellerContext } = await import("@/lib/data/team-service");
    const teamCtx = await getUserSellerContext(user.id);
    if (teamCtx && teamCtx.status === "suspended") {
      return NextResponse.json(
        { error: "Forbidden: Your team member account has been suspended" },
        { status: 403 },
      );
    }
    const sellerId = teamCtx ? teamCtx.sellerId : user.id;
    const role = teamCtx ? teamCtx.role : "owner";

    // RBAC (S3) — ai:chat required. Solo sellers are owners.
    if (!hasPermission(role, "ai:chat")) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions", required: "ai:chat", role },
        { status: 403 },
      );
    }

    // Rate limiting — 10 requests per minute per user
    const limit = await rateLimit(`ai:${user.id}`, 10, 60000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { ...rateLimitHeaders(limit), "Retry-After": "60" },
        },
      );
    }

    const body = await request.json();

    const parsed = aiRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    const {
      action,
      message: rawMessage,
      question: rawQuestion,
      businessContext,
      conversationHistory,
      orderContext,
      languageInstruction,
      locale,
    } = parsed.data;

    // Sanitize user inputs
    const message = sanitize(rawMessage || "");
    const question = sanitize(rawQuestion || "");

    switch (action) {
      case "extract_order": {
        if (!message)
          return NextResponse.json(
            { error: "message is required" },
            { status: 400 },
          );
        const result = await extractOrderFromMessage(message);
        return NextResponse.json({ success: true, data: result });
      }

      case "ask_assistant": {
        if (!question)
          return NextResponse.json(
            { error: "question is required" },
            { status: 400 },
          );
        const answer = await askSellerAssistant(
          question,
          businessContext || "No business data available yet.",
          conversationHistory || [],
        );
        return NextResponse.json({ success: true, answer });
      }

      case "suggest_replies": {
        if (!message)
          return NextResponse.json(
            { error: "message is required" },
            { status: 400 },
          );
        const suggestions = await generateReplySuggestions(
          message,
          orderContext as string | undefined,
        );
        return NextResponse.json({ success: true, suggestions });
      }

      case "agent_execute": {
        if (!question)
          return NextResponse.json(
            { error: "question is required" },
            { status: 400 },
          );

        // STREAMING MODE: return SSE if client requests it
        if (body.stream && sellerId) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              const send = (payload: unknown) => {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                );
              };

              try {
                const result = await executeAgent(
                  question,
                  sellerId!,
                  languageInstruction ||
                    "استجب فقط باللغة العربية الفصحى. لا تستخدم الدارجة أو اللهجة.",
                  conversationHistory || [],
                  locale || "ar",
                  (step: AgentStep) => {
                    send({ type: "step", ...step });
                  },
                );
                send({ type: "complete", result });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                send({ type: "error", error: msg });
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        // If we have a seller, use full agentic mode with tools
        if (sellerId) {
          const result = await executeAgent(
            question,
            sellerId,
            languageInstruction ||
              "استجب فقط باللغة العربية الفصحى. لا تستخدم الدارجة أو اللهجة.",
            conversationHistory || [],
            locale || "ar",
          );
          return NextResponse.json(result);
        }

        // Fallback: use basic assistant (no tools, but still helpful)
        const fallbackAnswer = await askSellerAssistant(
          question,
          "User is not yet fully onboarded. Help them with general e-commerce advice for Algeria.",
          conversationHistory || [],
        );
        return NextResponse.json({ answer: fallbackAnswer });
      }

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: extract_order, ask_assistant, suggest_replies, agent_execute",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.log(
      JSON.stringify({
        type: "ai_api_error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}
