import { describe, expect, it } from "vitest";
import { extractWithRegex, readOrderFields } from "../regex-extractor";

// Classes of wording the offline reader must know. Every sentence here is
// invented for the class; none is a message of the held-out set.
const lines = (body: string): string[] => (readOrderFields({ body }).order?.items ?? []).map((i) => `${i.quantity}x ${i.productName}`);

describe("order verbs a customer really uses", () => {
  it.each<[string, string[]]>([
    ["عفاك نحتاج 4 أكواب بيضاء، مستغانم", ["4x أكواب بيضاء"]],
    ["حابب نشري خمسة مصابيح، بجاية", ["5x مصابيح"]],
    ["دير لي 2 ساعات لتبسة", ["2x ساعات"]],
    ["salam rani f Chlef bghit pull gris", ["1x pull gris"]],
    ["Pouvez-vous m'envoyer 3 coussins à Skikda ?", ["3x coussins"]],
    ["نحب نجيب مكنسة، الشلف", ["1x مكنسة"]],
  ])("reads %s", (body, expected) => {
    expect(lines(body)).toEqual(expected);
    expect(extractWithRegex({ body }).order).not.toBeNull();
  });
});

describe("number words in Latin Darija", () => {
  it.each<[string, string[]]>([
    ["ts3a stylos Oran", ["9x stylos"]],
    ["tis3a mugs Blida", ["9x mugs"]],
    ["arb3a verres Alger", ["4x verres"]],
  ])("reads %s", (body, expected) => {
    expect(lines(body)).toEqual(expected);
  });
});

describe("a connector or a trailing 'one' is not part of the product", () => {
  it.each<[string, string[]]>([
    ["ابعثولي 3 مخدات على 0661 11 22 33", ["3x مخدات"]],
    ["ابعثولي 3 مخدات إلى 0661 11 22 33", ["3x مخدات"]],
    ["نحب مكنسة واحدة", ["1x مكنسة"]],
  ])("reads %s", (body, expected) => {
    expect(lines(body)).toEqual(expected);
  });
});

describe("chat stays chat", () => {
  it.each([
    "salam rani f Chlef",
    "عفاك واش كاين التوصيل لبجاية؟",
    "Pouvez-vous m'envoyer une photo du produit ?",
  ])("%s is no order", (body) => {
    expect(extractWithRegex({ body }).order).toBeNull();
  });
});
