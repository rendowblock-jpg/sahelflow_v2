import { AiChat } from "@/components/ai/ai-chat";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Assistant IA — SahelFlow" };
export const dynamic = "force-dynamic";

/**
 * Agents page — now hosts the live AI chat (session-based, 6 tools).
 * The chat uses Gemini (loaded from the Secret store) + an agentic loop that
 * can call tools to search products/customers, create orders, get stats, etc.
 */
export default function AgentsPage() {
  return <AiChat />;
}
