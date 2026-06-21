/**
 * AI chat agent — the agentic loop.
 *
 * Given a conversation history + a user message:
 *   1. Load the Gemini API key from the Secret store
 *   2. Send the conversation + tool definitions to Gemini
 *   3. If Gemini returns a function call → execute the tool → feed result back → repeat
 *   4. If Gemini returns text → save the assistant message → return it
 *   5. Max 5 iterations (prevents infinite tool-calling loops)
 *
 * If no Gemini key is configured, returns a helpful message directing the user
 * to Settings → IA.
 */

import { db } from "@/lib/db";
import { getSecret } from "@/lib/secrets";
import { getAllToolDefinitions, getTool, type ToolContext } from "./tools/registry";
import "./tools/core-tools"; // registers the 6 core tools

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `Tu es l'assistant IA de SahelFlow, une application de gestion de commandes COD (cash on delivery) pour les vendeurs algériens.

Tu peux aider avec:
- Rechercher des produits et des clients
- Créer des commandes
- Mettre à jour le statut des commandes
- Obtenir des statistiques (chiffre d'affaires, nombre de commandes, etc.)
- Estimer les frais de livraison

Réponds en français par défaut. Si l'utilisateur écrit en arabe, réponds en arabe. Sois concis et professionnel.

Utilise les outils disponibles quand c'est pertinent. Si une action nécessite des informations manquantes, demande-les avant de procéder.`;

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: GeminiFunctionCall;
      }>;
    };
  }>;
  error?: { message: string };
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
}

export interface AgentResult {
  response: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  error?: string;
}

export async function runAgent(
  conversationHistory: AgentMessage[],
  userMessage: string,
): Promise<AgentResult> {
  const apiKey = await getSecret("gemini_api_key");
  if (!apiKey) {
    return {
      response:
        "Je ne peux pas répondre car aucune clé Gemini n'est configurée. Allez dans Paramètres → Intelligence artificielle pour en ajouter une.",
      toolCalls: [],
    };
  }

  const toolDefs = getAllToolDefinitions();
  const ctx: ToolContext = { db };
  const allToolCalls: AgentResult["toolCalls"] = [];

  // Build the conversation contents (using a loose type to accommodate
  // text + functionCall + functionResponse parts)
  const contents: Array<{
    role: string;
    parts: Array<Record<string, unknown>>;
  }> = [
    ...conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let response: GeminiResponse | null = null;

    for (const model of MODELS) {
      try {
        const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            tools: [{ functionDeclarations: toolDefs }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          }),
        });

        clearTimeout(timeoutId);

        if (res.status === 400 || res.status === 404) continue; // try next model
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as GeminiResponse;
          return {
            response: "",
            toolCalls: allToolCalls,
            error: err.error?.message ?? `Erreur API: ${res.status}`,
          };
        }

        response = (await res.json()) as GeminiResponse;
        break;
      } catch {
        continue; // try next model
      }
    }

    if (!response) {
      return {
        response: "",
        toolCalls: allToolCalls,
        error: "Impossible de contacter Gemini. Vérifiez votre connexion.",
      };
    }

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const textPart = parts.find((p) => p.text);
    const functionCallPart = parts.find((p) => p.functionCall);

    // If Gemini called a function, execute it + feed the result back
    if (functionCallPart?.functionCall) {
      const fc = functionCallPart.functionCall;
      const tool = getTool(fc.name);
      let result: unknown;
      if (!tool) {
        result = { error: `Outil inconnu: ${fc.name}` };
      } else {
        const toolResult = await tool.execute(fc.args, ctx);
        result = toolResult.success ? toolResult.data : { error: toolResult.error };
      }

      allToolCalls.push({ name: fc.name, args: fc.args, result });

      // Feed the function result back to Gemini
      contents.push({
        role: "model",
        parts: [{ functionCall: fc }],
      });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: fc.name, response: { result } } }],
      });
      continue;
    }

    // Gemini returned a text response — we're done
    if (textPart?.text) {
      return { response: textPart.text, toolCalls: allToolCalls };
    }

    // No text + no function call — empty response, try again or give up
    return {
      response: "Je n'ai pas pu générer de réponse. Reformulez votre question.",
      toolCalls: allToolCalls,
    };
  }

  return {
    response: "J'ai atteint la limite d'itérations. Reformulez votre demande de manière plus simple.",
    toolCalls: allToolCalls,
  };
}

// ── STREAMING AGENT ─────────────────────────────────────────────────────────

/**
 * Streaming agent events. The client renders these incrementally:
 *   tool_call   — a tool is being invoked (show name + args)
 *   tool_result — the tool returned (show result summary)
 *   text_delta  — a chunk of the assistant's text response (append to bubble)
 *   done        — the full response is complete (save to DB, stop spinner)
 *   error       — something went wrong (show error message)
 */
export type AgentStreamEvent =
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "text_delta"; text: string }
  | { type: "done"; response: string; toolCalls: AgentResult["toolCalls"] }
  | { type: "error"; message: string };

/**
 * Streaming version of the agentic loop.
 *
 * Uses Gemini's `streamGenerateContent` endpoint so the assistant's text
 * response streams token-by-token. Tool calls are still synchronous (they're
 * DB operations), but the client gets real-time events for each step.
 *
 * Yields events in order:
 *   [tool_call, tool_result]* (0-5 iterations) → text_delta+ → done
 *
 * If no Gemini key is configured, yields a single `done` event with a helpful
 * message (same behavior as the non-streaming agent).
 */
export async function* runAgentStream(
  conversationHistory: AgentMessage[],
  userMessage: string,
): AsyncGenerator<AgentStreamEvent> {
  const apiKey = await getSecret("gemini_api_key");
  if (!apiKey) {
    yield {
      type: "done",
      response:
        "Je ne peux pas répondre car aucune clé Gemini n'est configurée. Allez dans Paramètres → Intelligence artificielle pour en ajouter une.",
      toolCalls: [],
    };
    return;
  }

  const toolDefs = getAllToolDefinitions();
  const ctx: ToolContext = { db };
  const allToolCalls: AgentResult["toolCalls"] = [];

  const contents: Array<{
    role: string;
    parts: Array<Record<string, unknown>>;
  }> = [
    ...conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let stream: ReadableStream<Uint8Array> | null = null;
    let lastError = "";

    // Try each model until one streams successfully
    for (const model of MODELS) {
      try {
        const url = `${GEMINI_API_URL}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            tools: [{ functionDeclarations: toolDefs }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          }),
        });

        clearTimeout(timeoutId);

        if (res.status === 400 || res.status === 404) continue; // try next model
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as GeminiResponse;
          lastError = err.error?.message ?? `Erreur API: ${res.status}`;
          continue;
        }

        stream = res.body;
        break;
      } catch {
        continue;
      }
    }

    if (!stream) {
      yield {
        type: "error",
        message: lastError || "Impossible de contacter Gemini. Vérifiez votre connexion.",
      };
      return;
    }

    // Parse the SSE stream. Gemini's streamGenerateContent with alt=sse returns
    // `data: {json}\n\n` lines. Each JSON object has the same shape as a
    // non-streaming response chunk (candidates[0].content.parts[]).
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let functionCall: GeminiFunctionCall | null = null;
    let hadAnyPart = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (terminated by \n\n)
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n\n")) >= 0) {
          const rawEvent = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 2);

          // Parse SSE format: `data: {json}`
          for (const line of rawEvent.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            let chunk: GeminiResponse;
            try {
              chunk = JSON.parse(jsonStr) as GeminiResponse;
            } catch {
              continue; // skip malformed chunk
            }

            if (chunk.error) {
              yield { type: "error", message: chunk.error.message };
              return;
            }

            const parts = chunk.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
              if (part.text) {
                fullText += part.text;
                hadAnyPart = true;
                yield { type: "text_delta", text: part.text };
              }
              if (part.functionCall) {
                functionCall = part.functionCall;
                hadAnyPart = true;
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // If Gemini called a function, execute it + feed the result back
    if (functionCall) {
      const fc = functionCall;
      yield { type: "tool_call", name: fc.name, args: fc.args };

      const tool = getTool(fc.name);
      let result: unknown;
      if (!tool) {
        result = { error: `Outil inconnu: ${fc.name}` };
      } else {
        const toolResult = await tool.execute(fc.args, ctx);
        result = toolResult.success ? toolResult.data : { error: toolResult.error };
      }

      allToolCalls.push({ name: fc.name, args: fc.args, result });
      yield { type: "tool_result", name: fc.name, result };

      // Feed the function result back to Gemini for the next iteration
      contents.push({ role: "model", parts: [{ functionCall: fc }] });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: fc.name, response: { result } } }],
      });
      continue;
    }

    // Gemini returned text (streamed above) — we're done
    if (fullText) {
      yield { type: "done", response: fullText, toolCalls: allToolCalls };
      return;
    }

    // No text + no function call — empty response
    if (!hadAnyPart) {
      yield {
        type: "done",
        response: "Je n'ai pas pu générer de réponse. Reformulez votre question.",
        toolCalls: allToolCalls,
      };
      return;
    }
  }

  yield {
    type: "done",
    response: "J'ai atteint la limite d'itérations. Reformulez votre demande de manière plus simple.",
    toolCalls: allToolCalls,
  };
}
