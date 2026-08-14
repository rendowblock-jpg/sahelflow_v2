import { describe, expect, it } from "vitest";

import {
  aiChatSystemPrompt,
  aiProposalRecordedMessage,
  aiUnknownToolMessage,
} from "../locale-context";

describe("AI locale-native runtime copy", () => {
  it("gives Arabic sessions an Arabic-first system instruction", () => {
    const prompt = aiChatSystemPrompt("ar");
    expect(prompt).toContain("أنت المساعد الذكي");
    expect(prompt).toContain("أجب بالعربية");
    expect(prompt).not.toContain("Tu es l'assistant IA");
  });

  it("gives English sessions an English-first system instruction", () => {
    const prompt = aiChatSystemPrompt("en");
    expect(prompt).toContain("You are SahelFlow's AI assistant");
    expect(prompt).toContain("Respond in English");
    expect(prompt).not.toContain("Tu es l'assistant IA");
  });

  it("localizes proposal and unknown-tool runtime messages", () => {
    expect(aiProposalRecordedMessage("ar", "update_product_price")).toContain(
      "تم حفظ اقتراح",
    );
    expect(aiProposalRecordedMessage("en", "update_product_price")).toContain(
      "An exact action proposal",
    );
    expect(aiProposalRecordedMessage("fr", "update_product_price")).toContain(
      "Une proposition d'action exacte",
    );
    expect(aiUnknownToolMessage("ar", "missing_tool")).toContain(
      "أداة غير معروفة",
    );
  });
});
