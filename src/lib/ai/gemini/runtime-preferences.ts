import "server-only";

import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_THINKING_LEVEL,
  parseGeminiModel,
  parseGeminiThinkingLevel,
  type GeminiModel,
  type GeminiThinkingLevel,
} from "@/lib/ai/gemini/catalog";
import type { ServiceContext } from "@/lib/data/service-base";
import { getSetting, SETTING_KEYS } from "@/lib/settings";

export interface GeminiRuntimePreferences {
  model: GeminiModel;
  thinkingLevel: GeminiThinkingLevel;
}

export const DEFAULT_GEMINI_RUNTIME_PREFERENCES: GeminiRuntimePreferences = {
  model: DEFAULT_GEMINI_MODEL,
  thinkingLevel: DEFAULT_GEMINI_THINKING_LEVEL,
};

export async function loadGeminiRuntimePreferences(
  context: ServiceContext,
): Promise<GeminiRuntimePreferences> {
  const [model, thinkingLevel] = await Promise.all([
    getSetting(context, SETTING_KEYS.geminiModel),
    getSetting(context, SETTING_KEYS.geminiThinkingLevel),
  ]);
  return {
    model: parseGeminiModel(model),
    thinkingLevel: parseGeminiThinkingLevel(thinkingLevel),
  };
}
