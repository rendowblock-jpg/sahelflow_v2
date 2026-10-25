import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CONVERSATION_TOKEN_REFERENCE,
  contactTokenStringsOf,
  hashTokenStrings,
  hashTokenStringsForConversations,
  requiredTokenStringsOf,
  tokenStringsOf,
  type BlindIndexDeriver,
} from "@/lib/search/conversation-search-tokens";
import { compactSearchText, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * Raw message bodies as customers and sellers type them. Every test folds them
 * with the project's own normalizeSearchText, exactly as the route does.
 */
const CORPUS: readonly string[] = [
  // Arabic: hamza, ta marbuta, ya / alef maqsura, tatweel, diacritics
  "السلام عليكم، أريد طلب هذا المنتج",
  "هل التوصيل متوفر إلى الجزائر العاصمة؟",
  "الجزائر",
  "أحمد إبراهيم آمن ؤئ",
  "المدرســـة الإبتدائية فاطمة الزهراء",
  "على ى يـ مصطفى موسى",
  "مَرْحَباً بِكُمْ في المَتْجَر",
  "\u200Fمرحبا\u200E بكم\u061C",
  // Arabic-Indic and Persian digits
  "رقم الهاتف ٠٦٥٥١٢٣٤٥٦ شكرا",
  "٠٥٥٥ ١٢ ٣٤ ٥٦ وأيضا ۰۶۷۰۱۱۲۲۳۳",
  "السعر ٢٥٠٠ دج للقطعة الواحدة",
  // French with accents
  "Bonjour, je voudrais commander à Alger, c'est urgent !",
  "Où est ma livraison? Très déçu… j’attends depuis 3 jours",
  "Café crème à l'été, ÉLÈVE Ça va très bien",
  "À bientôt, merci beaucoup pour la réponse",
  // Latin Darija
  "salam khouya, bghit n3ref ch7al le prix dyal had l produit",
  "wach kayen livraison l wahran? 9olli",
  "mchit l post 3la 7sab l colis, mal9itouch",
  // Phones: +213, 00213, spaced, dashed, dotted
  "mon numéro +213 655 12 34 56 merci",
  "appelle moi au 00213655123456 svp",
  "0655 12 34 56 ou 0555-12-34-56",
  "+213 (0) 655 123 456",
  "tel: 0770.11.22.33 / 021 55 66 77",
  "213655123456",
  // Punctuation inside words
  "re-bonjour!!! (ok) [oui] a.b.c @user #tag",
  "http://x.dz/a?b=1&c=2 5,000DA 2500.00 DZD",
  "c'est-à-dire l'adresse d'aujourd'hui",
  // Mixed scripts
  "slm محمد, commande رقم 123 svp",
  "ok ✅ شكرا merci 🙏 تمام",
  "Ahmed أحمد AHMED احمد",
  // Emoji (surrogate pairs), width forms
  "😀😀 ok 👍🏽 thanks 😀",
  "ＡＢＣ　ｄｅｆ ｇｈｉ",
  // One-letter words, repeats, short and degenerate
  "a b c d e f",
  "je t'aime a toi",
  "x",
  "ab",
  "abc",
  "ab ab ab",
  "abababababab ababab",
  "aaaaaaaaaaaaaaaaaaaaaaaa",
  "",
  "   ",
];

function substringsOf(text: string, minLength: number): string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    for (let end = start + minLength; end <= text.length; end += 1) {
      result.push(text.slice(start, end));
    }
  }
  return result;
}

function missingFrom(required: readonly string[], tokens: ReadonlySet<string>): string[] {
  return required.filter((token) => !tokens.has(token));
}

describe("tokenStringsOf: which strings one message stores", () => {
  it("gives the first two characters and every three-character piece of a word", () => {
    expect(tokenStringsOf("bonjour").sort()).toEqual(
      [
        "msg-p:bo",
        "msg-t:bon",
        "msg-t:onj",
        "msg-t:njo",
        "msg-t:jou",
        "msg-t:our",
      ].sort(),
    );
  });

  it("makes exactly 1 + (L - 2) tokens for a word of L >= 3 distinct letters", () => {
    expect(tokenStringsOf("abcdefg")).toHaveLength(6); // 7 letters: 1 + 5
    expect(tokenStringsOf("abcdefghij")).toHaveLength(9);
    expect(tokenStringsOf("abc")).toHaveLength(2);
    expect(tokenStringsOf("ab")).toEqual(["msg-p:ab"]);
  });

  it("ignores one-letter words, empty text and blanks", () => {
    expect(tokenStringsOf("")).toEqual([]);
    expect(tokenStringsOf("   ")).toEqual([]);
    expect(tokenStringsOf("a")).toEqual([]);
    expect(tokenStringsOf("a b c d")).toEqual([]);
  });

  it("is deterministic and never repeats a token string", () => {
    for (const raw of CORPUS) {
      const folded = normalizeSearchText(raw);
      const first = tokenStringsOf(folded);
      expect(new Set(first).size).toBe(first.length);
      expect(tokenStringsOf(folded)).toEqual(first);
    }
    const repeated = tokenStringsOf("abababab abababab ab");
    expect(new Set(repeated).size).toBe(repeated.length);
  });

  it("keeps the two kinds of token apart (a 2-letter start is not a 3-letter piece)", () => {
    const tokens = tokenStringsOf("ab abc");
    expect(tokens).toContain("msg-p:ab");
    expect(tokens).toContain("msg-t:abc");
    expect(tokens).not.toContain("msg-t:ab");
  });
});

describe("T2: the required tokens of any substring query are inside the message tokens", () => {
  it("holds for EVERY substring of 3 or more characters of every corpus body", () => {
    const failures: Array<{ body: string; query: string; missing: string[] }> = [];
    let checked = 0;
    let withConstraint = 0;
    for (const raw of CORPUS) {
      const body = normalizeSearchText(raw);
      const tokens = new Set(tokenStringsOf(body));
      for (const query of substringsOf(body, 3)) {
        checked += 1;
        const required = requiredTokenStringsOf(query);
        if (required.length > 0) withConstraint += 1;
        const missing = missingFrom(required, tokens);
        if (missing.length > 0 && failures.length < 5) {
          failures.push({ body, query, missing });
        }
      }
    }
    expect(failures).toEqual([]);
    // Not vacuous: thousands of substrings, most of them really constrained.
    expect(checked).toBeGreaterThan(5_000);
    expect(withConstraint).toBeGreaterThan(checked * 0.7);
  });

  it("holds for a query typed in another spelling than the stored body", () => {
    const pairs: Array<[body: string, typed: string]> = [
      ["أحمد إبراهيم", "احمد ابراهيم"],
      ["المدرســـة الابتدائية", "مدرسة الابتدائية"],
      ["فاطمة الزهراء", "فاطمه الزهراء"],
      ["على مصطفى", "علي مصطفي"],
      ["Très déçu de la livraison", "tres decu"],
      ["Très déçu de la livraison", "DÉCU DE LA LIV"],
      ["رقم ٠٦٥٥١٢٣٤٥٦ شكرا", "0655123"],
      ["appelle +213 655 12 34 56", "+213 655 12"],
      ["appelle 00213655123456 svp", "00213655"],
      ["ＡＢＣ　ｄｅｆ", "abc def"],
    ];
    for (const [rawBody, typed] of pairs) {
      const body = normalizeSearchText(rawBody);
      const query = normalizeSearchText(typed);
      // The pair is only meaningful if today's test finds it.
      expect(body.includes(query), `${rawBody} / ${typed}`).toBe(true);
      const missing = missingFrom(requiredTokenStringsOf(query), new Set(tokenStringsOf(body)));
      expect(missing, `${rawBody} / ${typed}`).toEqual([]);
    }
  });

  it("holds for a 2-character query exactly when it starts a word", () => {
    const failures: Array<{ body: string; query: string }> = [];
    let startOfWord = 0;
    for (const raw of CORPUS) {
      const body = normalizeSearchText(raw);
      const tokens = new Set(tokenStringsOf(body));
      const words = body.split(" ").filter(Boolean);
      for (const query of substringsOf(body, 2).filter((entry) => entry.length === 2)) {
        if (query.includes(" ")) {
          // a space inside a 2-character piece leaves two pieces under 2 characters
          expect(requiredTokenStringsOf(query)).toEqual([]);
          continue;
        }
        if (!words.some((word) => word.startsWith(query))) continue;
        startOfWord += 1;
        const required = requiredTokenStringsOf(query);
        if (required.length === 0 || missingFrom(required, tokens).length > 0) {
          failures.push({ body, query });
        }
      }
    }
    expect(failures).toEqual([]);
    expect(startOfWord).toBeGreaterThan(100);
  });

  it("documents the behaviour change: a 2-character piece in the MIDDLE of a word is NOT required to be found", () => {
    const body = normalizeSearchText("livraison");
    // Today `ra` finds "livraison" (substring). Through the index it will not.
    expect(body.includes("ra")).toBe(true);
    expect(requiredTokenStringsOf("ra")).toEqual(["msg-p:ra"]);
    expect(tokenStringsOf(body)).not.toContain("msg-p:ra");
    // ...while a 3-character piece in the middle IS found, as today.
    expect(missingFrom(requiredTokenStringsOf("vra"), new Set(tokenStringsOf(body)))).toEqual([]);
    expect(missingFrom(requiredTokenStringsOf("rai"), new Set(tokenStringsOf(body)))).toEqual([]);

    // Over the corpus: some mid-word pair is genuinely not covered.
    let notCovered = 0;
    for (const raw of CORPUS) {
      const body = normalizeSearchText(raw);
      const tokens = new Set(tokenStringsOf(body));
      for (const query of substringsOf(body, 2).filter((entry) => entry.length === 2 && !entry.includes(" "))) {
        if (missingFrom(requiredTokenStringsOf(query), tokens).length > 0) notCovered += 1;
      }
    }
    expect(notCovered).toBeGreaterThan(50);
  });

  it("asks for nothing when no piece is long enough to constrain (the caller must use the old path)", () => {
    expect(requiredTokenStringsOf("")).toEqual([]);
    expect(requiredTokenStringsOf("a")).toEqual([]);
    expect(requiredTokenStringsOf("a b c")).toEqual([]);
    // the first word of several is the END of a body word: under 3 characters adds nothing
    expect(requiredTokenStringsOf("ab cd")).toEqual(["msg-p:cd"]);
    expect(requiredTokenStringsOf("b ab")).toEqual(["msg-p:ab"]);
  });

  it("derives the rule piece by piece: first = end of a word, middle = whole word, last = start of a word", () => {
    expect(requiredTokenStringsOf("jour")).toEqual(["msg-t:jou", "msg-t:our"]); // single word: anywhere
    expect(requiredTokenStringsOf("our bon jo")).toEqual([
      "msg-t:our", // end of a body word: no msg-p
      "msg-p:bo", // whole word
      "msg-t:bon",
      "msg-p:jo", // start of a word
    ]);
  });

  it("finds the Arabic query جزا inside الجزائر", () => {
    const body = normalizeSearchText("الجزائر");
    const query = normalizeSearchText("جزا");
    expect(body.includes(query)).toBe(true);
    const required = requiredTokenStringsOf(query);
    expect(required).toEqual(["msg-t:جزا"]);
    expect(new Set(tokenStringsOf(body)).has("msg-t:جزا")).toBe(true);
    // the same with the hamza form the customer would type
    expect(missingFrom(requiredTokenStringsOf(normalizeSearchText("جزائر")), new Set(tokenStringsOf(body)))).toEqual([]);
  });

  it("holds for phone numbers typed in other shapes than stored", () => {
    const body = normalizeSearchText("appelle moi au 0655 12 34 56 ou +213 655 123 456");
    const tokens = new Set(tokenStringsOf(body));
    for (const typed of ["0655", "655 12", "55 12 34", "+213 655", "213 655 123", "123 456", "34 56 ou"]) {
      const query = normalizeSearchText(typed);
      expect(body.includes(query), typed).toBe(true);
      expect(missingFrom(requiredTokenStringsOf(query), tokens), typed).toEqual([]);
    }
  });
});

describe("size of the stored index", () => {
  const SAMPLES: readonly string[] = [
    "السلام عليكم أريد طلب هذا المنتج",
    "هل التوصيل متوفر إلى الجزائر العاصمة؟",
    "كم سعر القميص الأزرق مقاس لارج",
    "شكرا جزيلا وصلتني الطرد اليوم الحمد لله",
    "واش كاين التوصيل لولاية وهران",
    "بغيت نعرف شحال الثمن ديال هاد المنتوج",
    "ممكن تبعثلي صور أكثر للمنتج من فضلك",
    "تم استلام الطلب رقم ٢٤٥٦ بنجاح",
    "Bonjour, je voudrais commander deux paires de chaussures taille 42",
    "Quel est le délai de livraison pour Constantine ?",
    "Merci beaucoup, j'ai bien reçu mon colis ce matin",
    "Est-ce que le paiement à la livraison est possible ?",
    "Mon numéro est le 0655 12 34 56, appelez-moi svp",
    "Je veux annuler ma commande, elle est en retard",
    "salam khouya, bghit n3ref ch7al le prix dyal had l produit",
    "wach kayen livraison l wahran? 9olli",
    "mchit l post 3la 7sab l colis mal9itouch",
    "rani nstenna fi commande dyali, kamel chhar daz",
    "3awnouni ndir retour l produit, jebtou ghalat",
    "ok merci, nkhalsek ghodwa incha allah",
  ];

  it("a 7-letter word makes exactly 6 tokens (1 prefix + 5 pieces)", () => {
    expect(tokenStringsOf(normalizeSearchText("bonjour"))).toHaveLength(6);
    expect(tokenStringsOf(normalizeSearchText("الجزائر"))).toHaveLength(6); // 7 letters after the fold
    expect(tokenStringsOf(normalizeSearchText("ABCDEFG"))).toHaveLength(6);
  });

  it("reports the average tokens per message for 20 realistic messages", () => {
    const counts = SAMPLES.map((raw) => tokenStringsOf(normalizeSearchText(raw)).length);
    const words = SAMPLES.map(
      (raw) => normalizeSearchText(raw).split(" ").filter((word) => word.length >= 2).length,
    );
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const averageWords = words.reduce((sum, count) => sum + count, 0) / words.length;
    const summary =
      `TOKEN-SIZE samples=${SAMPLES.length} avgTokensPerMessage=${average.toFixed(1)} ` +
      `avgWordsPerMessage=${averageWords.toFixed(1)} min=${Math.min(...counts)} max=${Math.max(...counts)}`;
    console.warn(summary);
    expect(summary).toMatch(/^TOKEN-SIZE/u);
    expect(SAMPLES).toHaveLength(20);
    expect(average).toBeGreaterThan(20);
    expect(average).toBeLessThan(120);
  });
});

/** HMAC stand-in for the shop key; records every call so the tests can read the inputs. */
function fakeDeriver(key = "unit-test-key") {
  const calls: Array<{ values: string[]; reference: { recordType: string; field: string } }> = [];
  const derive: BlindIndexDeriver = async (values, reference) => {
    calls.push({ values: [...values], reference: { ...reference } });
    return values.map((value) =>
      createHmac("sha256", key).update(reference.field).update("\0").update(value, "utf8").digest("hex"),
    );
  };
  return { derive, calls };
}

describe("hashTokenStrings: the stored 48-bit numbers", () => {
  it("asks the blind-index derivation for SearchProjection / conversation-token", async () => {
    expect(CONVERSATION_TOKEN_REFERENCE).toEqual({
      recordType: "SearchProjection",
      field: "conversation-token",
    });
    const { derive, calls } = fakeDeriver();
    await hashTokenStrings(["msg-p:bo"], "conv-1", derive);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.reference).toEqual({ recordType: "SearchProjection", field: "conversation-token" });
  });

  it("takes the first 6 bytes of the digest as a number below 2^48", async () => {
    const derive: BlindIndexDeriver = async (values) =>
      values.map(() => "0123456789abcdeffedcba9876543210".repeat(2));
    const hashes = await hashTokenStrings(["msg-p:bo", "msg-t:bon"], "conv-1", derive);
    expect(hashes).toEqual([0x0123456789ab, 0x0123456789ab]);
    const real = await hashTokenStrings(tokenStringsOf("bonjour merci"), "conv-1", fakeDeriver().derive);
    for (const hash of real!) {
      expect(Number.isSafeInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 48);
    }
  });

  it("is salted per conversation: same word, same conversation = same number; other conversation = other number", async () => {
    const { derive } = fakeDeriver();
    const strings = tokenStringsOf("salam merci livraison");
    const a1 = await hashTokenStrings(strings, "conv-A", derive);
    const a2 = await hashTokenStrings(strings, "conv-A", derive);
    const b = await hashTokenStrings(strings, "conv-B", derive);
    expect(a1).toEqual(a2);
    expect(a1).toHaveLength(strings.length);
    // every single token differs between the two conversations
    a1!.forEach((hash, index) => expect(hash).not.toBe(b![index]));
  });

  it("puts the conversation id and the token string into the hashed input, unambiguously", async () => {
    const { derive, calls } = fakeDeriver();
    await hashTokenStrings(["msg-t:abc"], "conv-A", derive);
    await hashTokenStrings(["msg-t:abc"], "conv-B", derive);
    const [first, second] = calls.map((call) => call.values[0]!);
    expect(first).toContain("conv-A");
    expect(first).toContain("msg-t:abc");
    expect(first).not.toBe(second);
    // "conv-a" + word "b:x" must not equal "conv-a:b" + word "x"
    await hashTokenStrings(["msg-t:b:x"], "a", derive);
    await hashTokenStrings(["msg-t:x"], "a:b", derive);
    expect(calls[2]!.values[0]).not.toBe(calls[3]!.values[0]);
  });

  it("returns null, never an empty list, when the key is missing", async () => {
    const missingKey: BlindIndexDeriver = async () => null;
    const result = await hashTokenStrings(["msg-p:bo", "msg-t:bon"], "conv-1", missingKey);
    expect(result).toBeNull();
    expect(result).not.toEqual([]);
    expect(await hashTokenStringsForConversations(["msg-p:bo"], ["c1", "c2"], missingKey)).toBeNull();
  });

  it("returns an empty list for nothing to hash, without touching the key", async () => {
    const { derive, calls } = fakeDeriver();
    expect(await hashTokenStrings([], "conv-1", derive)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty conversation id or one with a NUL (no salt = no salting)", async () => {
    const { derive } = fakeDeriver();
    await expect(hashTokenStrings(["msg-p:bo"], "", derive)).rejects.toThrow(/conversationId/);
    await expect(hashTokenStrings(["msg-p:bo"], "a\u0000b", derive)).rejects.toThrow(/conversationId/);
  });

  it("refuses a derivation that answers with the wrong count or a non-hex digest", async () => {
    await expect(
      hashTokenStrings(["msg-p:bo", "msg-t:bon"], "c", async () => ["0123456789abcdef"]),
    ).rejects.toThrow(/count/);
    await expect(hashTokenStrings(["msg-p:bo"], "c", async () => ["not-a-digest!!"])).rejects.toThrow(/hex/);
  });

  it("hashes the window's conversations in ONE derivation call", async () => {
    const { derive, calls } = fakeDeriver();
    const strings = ["msg-p:bo", "msg-t:bon", "msg-t:ono"];
    const byConversation = await hashTokenStringsForConversations(strings, ["c1", "c2", "c1", "c3"], derive);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.values).toHaveLength(9); // 3 conversations x 3 tokens, duplicate id once
    expect([...byConversation!.keys()]).toEqual(["c1", "c2", "c3"]);
    for (const id of ["c1", "c2", "c3"]) {
      expect(byConversation!.get(id)).toEqual(await hashTokenStrings(strings, id, fakeDeriver().derive));
    }
  });
});

describe("contactTokenStringsOf", () => {
  const compactOf = (strings: string[]) => strings.filter((entry) => entry.startsWith("conv-c:")).sort();

  it("uses three prefixes of its own and never a message prefix", () => {
    const strings = contactTokenStringsOf("Amine Ben Ali", "+213 555 12 34 56");
    expect(strings.length).toBeGreaterThan(30);
    expect(strings.every((entry) => /^conv-[npc]:msg-[pt]:/u.test(entry))).toBe(true);
    const messageStrings = new Set(tokenStringsOf(normalizeSearchText("Amine Ben Ali +213 555 12 34 56")));
    expect(strings.filter((entry) => messageStrings.has(entry))).toEqual([]);
    expect(new Set(strings).size).toBe(strings.length);
  });

  it("folds the name and the phone as the search does, and adds the compact forms", () => {
    const strings = new Set(contactTokenStringsOf("Amine Ben Ali", "0555 12 34 56"));
    expect(strings.has("conv-n:msg-t:ami")).toBe(true);
    expect(strings.has("conv-n:msg-t:neb")).toBe(false); // across the space: only the compact form has it
    expect(strings.has("conv-c:msg-t:neb")).toBe(true);
    expect(strings.has("conv-p:msg-t:555")).toBe(true);
    expect(strings.has("conv-c:msg-t:512")).toBe(true); // 0555123456 across the spaces of the phone
    expect(new Set(contactTokenStringsOf("أحمد بن علي", null)).has("conv-n:msg-p:" + normalizeSearchText("أحمد").slice(0, 2))).toBe(true);
  });

  it("reads +213, 00213 and 213 as the national 0 in the compact tokens", () => {
    const national = compactOf(contactTokenStringsOf(null, "0555 12 34 56"));
    expect(national.length).toBeGreaterThan(5);
    for (const written of ["+213555123456", "+213 555 12 34 56", "00213555123456", "213555123456"]) {
      expect(compactOf(contactTokenStringsOf(null, written))).toEqual(national);
    }
    expect(compactSearchText("+213555123456")).toBe("0555123456");
  });

  it("gives nothing for a missing or empty name or phone, and never throws", () => {
    expect(contactTokenStringsOf(null, null)).toEqual([]);
    expect(contactTokenStringsOf(undefined, "")).toEqual([]);
    expect(contactTokenStringsOf("", "   ")).toEqual([]);
    expect(contactTokenStringsOf("Karim", null).some((entry) => entry.startsWith("conv-p:"))).toBe(false);
    expect(contactTokenStringsOf(null, "0555123456").some((entry) => entry.startsWith("conv-n:"))).toBe(false);
  });
});
