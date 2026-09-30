import { describe, expect, it } from "vitest";

import {
  formatTranscriptMarkdown,
  formatTranscriptText,
  transcriptFileName,
} from "../transcript";

const labels = { you: "You", agent: "SahelFlow Agent" };
const at = new Date("2026-09-30T08:15:00Z");

describe("Agents transcript formats", () => {
  const messages = [
    { role: "user", content: "# not a heading\n- nor a list" },
    { role: "assistant", content: "**3** orders are pending.\n\n| a | b |\n|---|---|" },
    { role: "assistant", content: "   " },
  ];

  it("copies speaker-labelled plain text and skips empty turns", () => {
    expect(formatTranscriptText(messages, labels)).toBe(
      "You:\n# not a heading\n- nor a list\n\nSahelFlow Agent:\n**3** orders are pending.\n\n| a | b |\n|---|---|",
    );
  });

  it("exports Markdown with quoted seller turns and verbatim agent Markdown", () => {
    const markdown = formatTranscriptMarkdown("Pending orders", messages, labels, at);
    expect(markdown).toBe(
      [
        "# Pending orders",
        "_2026-09-30 08:15 UTC_",
        "### You\n\n> # not a heading\n> - nor a list",
        "### SahelFlow Agent\n\n**3** orders are pending.\n\n| a | b |\n|---|---|",
      ].join("\n\n") + "\n",
    );
  });

  it("falls back to the agent name for an untitled conversation", () => {
    expect(formatTranscriptMarkdown("  ", [], labels, at).startsWith("# SahelFlow Agent\n")).toBe(true);
  });

  it("builds portable file names in any script", () => {
    expect(transcriptFileName("Commandes en attente — lundi", at)).toBe(
      "commandes-en-attente-lundi-2026-09-30.md",
    );
    expect(transcriptFileName("الطلبات المعلقة", at)).toBe("الطلبات-المعلقة-2026-09-30.md");
    expect(transcriptFileName("???", at)).toBe("sahelflow-conversation-2026-09-30.md");
  });
});
