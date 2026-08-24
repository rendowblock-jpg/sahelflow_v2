import { describe, expect, it } from "vitest";

import { serializeToolResultForRemoteModel } from "../redact";

describe("get_conversation_messages remote semantic projection", () => {
  it("preserves actionable variant context without exporting arbitrary customer text", () => {
    const rawBodies = [
      "Karim Benali 0555 12 34 56: I want the red model in size M",
      "Je veux le modèle bleu taille L",
      "أريد اللون الأسود مقاس XL",
    ];

    const output = serializeToolResultForRemoteModel(
      "get_conversation_messages",
      rawBodies.map((body, index) => ({
        id: `msg-${index + 1}`,
        direction: "inbound",
        body,
        timestamp: `2026-08-24T10:0${index}:00.000Z`,
        extracted: false,
      })),
    ) as Array<Record<string, unknown>>;

    expect(output[0]?.context).toEqual({
      question: false,
      intents: ["selection"],
      hasOrderReference: false,
      attributes: { colors: ["red"], sizes: ["M"] },
    });
    expect(output[1]?.context).toEqual({
      question: false,
      intents: ["selection"],
      hasOrderReference: false,
      attributes: { colors: ["blue"], sizes: ["L"] },
    });
    expect(output[2]?.context).toEqual({
      question: false,
      intents: ["selection"],
      hasOrderReference: false,
      attributes: { colors: ["black"], sizes: ["XL"] },
    });

    const serialized = JSON.stringify(output);
    for (const body of rawBodies) {
      expect(serialized).not.toContain(body);
    }
    expect(serialized).not.toContain("Karim Benali");
    expect(serialized).not.toContain("0555 12 34 56");
    expect(serialized).not.toContain("modèle");
    expect(serialized).not.toContain("اللون");
  });

  it("keeps unrelated free-form content withheld instead of echoing unknown tokens", () => {
    const rawBody =
      "Meet Samir at 12 Rue Didouche Mourad and discuss the Zéphyr-custom request";
    const output = serializeToolResultForRemoteModel("get_conversation_messages", [
      {
        id: "msg-private",
        direction: "inbound",
        body: rawBody,
        timestamp: "2026-08-24T11:00:00.000Z",
        extracted: false,
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]?.context).toEqual({
      question: false,
      intents: ["other"],
      hasOrderReference: false,
    });
    expect(JSON.stringify(output)).not.toContain(rawBody);
    expect(JSON.stringify(output)).not.toContain("Samir");
    expect(JSON.stringify(output)).not.toContain("Didouche");
    expect(JSON.stringify(output)).not.toContain("Zéphyr-custom");
  });

  it("canonicalizes known directions and withholds free-form direction drift", () => {
    const leakedDirection =
      "Karim Benali 0555 12 34 56 near 12 Rue Didouche Mourad";
    const output = serializeToolResultForRemoteModel(
      "get_conversation_messages",
      [
        {
          id: "msg-in",
          direction: " INBOUND ",
          body: "hello",
          timestamp: "2026-08-24T12:00:00.000Z",
          extracted: false,
        },
        {
          id: "msg-out",
          direction: "OUTBOUND",
          body: "hello",
          timestamp: "2026-08-24T12:01:00.000Z",
          extracted: false,
        },
        {
          id: "msg-drift",
          direction: leakedDirection,
          body: "hello",
          timestamp: "2026-08-24T12:02:00.000Z",
          extracted: false,
        },
      ],
    ) as Array<Record<string, unknown>>;

    expect(output.map((message) => message.direction)).toEqual([
      "inbound",
      "outbound",
      null,
    ]);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain(leakedDirection);
    expect(serialized).not.toContain("Karim Benali");
    expect(serialized).not.toContain("0555 12 34 56");
    expect(serialized).not.toContain("Didouche");
  });
});