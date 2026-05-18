/**
 * SahelFlow AI Service
 * Handles AI-powered assistant interactions via Groq
 */

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Extract order details from a customer message using AI
 */
export async function extractOrderFromMessage(message: string) {
  const { extractOrderFromSingleMessage } = await import("./extraction");
  return extractOrderFromSingleMessage(message);
}

/**
 * Ask the seller assistant a question with business context
 */
export async function askSellerAssistant(
  question: string,
  businessContext: string,
  conversationHistory: AIMessage[] = [],
): Promise<string> {
  const { callLLM } = await import("../agents/groq");

  try {
    const messages = [
      {
        role: "system" as const,
        content: `You are SahelFlow AI, a helpful assistant for Algerian e-commerce sellers. Answer questions based on the business context provided.\n\nBusiness Context:\n${businessContext}`,
      },
      ...conversationHistory.slice(-6).map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
      { role: "user" as const, content: question },
    ];
    
    return await callLLM(messages, { temperature: 0.5 });
  } catch (err) {
    console.error("AI assistant error:", err);
    return "An error occurred while processing your request. Please try again.";
  }
}

/**
 * Generate quick reply suggestions for a customer message
 */
export async function generateReplySuggestions(
  message: string,
  orderContext?: string,
): Promise<string[]> {
  const { callLLMJson } = await import("../agents/groq");

  try {
    const messages = [
      {
        role: "system" as const,
        content: `Generate 3 short reply suggestions for an Algerian e-commerce seller responding to a customer message. Keep them natural, conversational, and in the same language as the customer. Return ONLY a JSON array of strings.${orderContext ? `\n\nOrder context: ${orderContext}` : ""}`,
      },
      { role: "user" as const, content: message },
    ];

    const parsed = await callLLMJson<string[]>(messages, { temperature: 0.7 });
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
    
    return ["Thank you!", "I'll check on that.", "Order confirmed."];
  } catch {
    return ["Thank you!", "I'll check on that.", "Order confirmed."];
  }
}
