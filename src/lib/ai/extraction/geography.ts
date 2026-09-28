/**
 * Wilaya and commune recognition for the offline extractor (FD-064).
 *
 * Customers write geography in many ways: French or Arabic official names,
 * Darija spellings ("wahran", "dzayer"), abbreviations ("bba", "sba"), wilaya
 * numbers ("wilaya 16"), attached Arabic/Darija prepositions ("لوهران",
 * "للجزائر", "l'annaba", "lwahran"). When several wilayas appear, the one the
 * customer wants delivery to is chosen by cue ("livraison", "wilaya", "ل…",
 * a matching wilaya number), never by list order.
 */
import communes from "../../../../data/communes.json";
import wilayas from "../../../../data/wilayas.json";
import { DELIVERY_CUES } from "./lexicon";
import { B_AFTER, B_BEFORE, escapeRegExp, fold, foldKey, phraseAlternation } from "./text";

export interface GeoMention {
  code: number;
  start: number;
  end: number;
  score: number;
}

const EXTRA_WILAYA_ALIASES: Record<number, string[]> = {
  5: ["batna"],
  6: ["bejaia", "bgayet", "vgayet", "bougie", "bejaya"],
  9: ["el blida", "lblida"],
  13: ["tilimsen", "tlemsen"],
  15: ["tizi", "tizi ouzou", "tizi-ouzou", "tizi wezzu", "tiziouzou"],
  16: ["algiers", "alger centre", "dzair", "dzayer", "djazair", "el djazair", "الجزائر العاصمه", "العاصمه", "la capitale", "3asima", "el asima"],
  17: ["jelfa"],
  19: ["setif", "stif", "سطيف"],
  22: ["sidi bel abbes", "sidi belabbes", "sba", "bel abbes", "بلعباس"],
  23: ["anaba", "3annaba", "عنابه"],
  25: ["qsantina", "ksantina", "constantina", "qsentina", "قسنطينه"],
  27: ["mosta"],
  28: ["msila", "m'sila"],
  31: ["wahran", "ouahran", "wehran"],
  34: ["bba", "bordj", "bordj bou arreridj", "bordj bouarreridj"],
  35: ["boumerdes", "boumerdas"],
  39: ["oued souf", "el oued", "souf", "وادي سوف"],
  44: ["ain defla"],
  46: ["ain temouchent", "temouchent"],
  47: ["ghardaia", "ghardaya"],
  4: ["oum el bouaghi", "oeb"],
};

/** Bare Arabic stems that are ordinary words and must keep their article. */
const RISKY_ARABIC_STEMS = new Set(["بيض", "وادي", "نعامه", "مغير", "طارف", "مديه"]);

interface Alias {
  key: string;
  code: number;
}

function buildAliases(): Alias[] {
  const aliases: Alias[] = [];
  const push = (label: string, code: number) => {
    const key = foldKey(label);
    if (key.length >= 3 || /^\p{Script=Arabic}+$/u.test(key)) aliases.push({ key, code });
  };
  for (const wilaya of wilayas) {
    push(wilaya.name, wilaya.code);
    const arabic = foldKey(wilaya.nameAr);
    push(arabic, wilaya.code);
    if (arabic.startsWith("ال")) {
      const stem = arabic.slice(2);
      if (stem.length >= 3 && !RISKY_ARABIC_STEMS.has(stem)) push(stem, wilaya.code);
    }
    for (const extra of EXTRA_WILAYA_ALIASES[wilaya.code] ?? []) push(extra, wilaya.code);
  }
  return aliases;
}

const ALIASES = buildAliases();
const ALIAS_BY_KEY = new Map(ALIASES.map((alias) => [alias.key, alias.code]));
const WILAYA_NAME = new Map(wilayas.map((wilaya) => [wilaya.code, wilaya.name]));

const ARABIC_PREFIX = "(?:وال|بال|فال|لل|ال|ل|ب|ف|و)";
const ALIAS_PATTERN = new RegExp(
  `${B_BEFORE}(?<prefix>${ARABIC_PREFIX}|l'?|el\\s)?(?<alias>${ALIASES
    .map((alias) => escapeRegExp(alias.key).replace(/ /g, "[\\s'-]*"))
    .sort((left, right) => right.length - left.length)
    .join("|")})${B_AFTER}`,
  "gu",
);

const WILAYA_NUMBER_PATTERN = new RegExp(
  `${B_BEFORE}(?:l|el|al|fi|f|ل|في)?\\s?(?:wilaya|wilayat|wilayet|willaya|wlaya|ولايه|الولايه|ولايت)\\s*(?:n°|no\\.?|num|numero|رقم)?\\s*[:\\-]?\\s*(?<code>\\d{1,2})(?!\\d)`,
  "gu",
);

const CUE_BEFORE = new RegExp(`${B_BEFORE}(?:${phraseAlternation(DELIVERY_CUES)})[\\s:'-]*$`, "u");

function mentionScore(folded: string, start: number, end: number, prefix: string): number {
  let score = 1;
  const before = folded.slice(Math.max(0, start - 22), start);
  if (CUE_BEFORE.test(before)) score += 2;
  if (prefix && /^(?:ل|لل|l)/u.test(prefix)) score += 1;
  // "blida ykon fiha stock?" — a wilaya inside a question is usually asked
  // about, not delivered to.
  const clauseEnd = folded.slice(end).search(/[\n,،.;!؛]/u);
  const rest = folded.slice(end, clauseEnd === -1 ? undefined : end + clauseEnd);
  if (/[?؟]/u.test(rest)) score -= 1;
  return score;
}

export function findWilayaMentions(folded: string): GeoMention[] {
  const mentions: GeoMention[] = [];
  for (const match of folded.matchAll(WILAYA_NUMBER_PATTERN)) {
    const code = Number(match.groups?.code);
    if (code < 1 || code > 58) continue;
    const start = match.index ?? 0;
    mentions.push({ code, start, end: start + match[0].length, score: 3 });
  }
  for (const match of folded.matchAll(ALIAS_PATTERN)) {
    const aliasKey = (match.groups?.alias ?? "").replace(/[\s'-]+/g, " ");
    const code = ALIAS_BY_KEY.get(aliasKey) ?? ALIAS_BY_KEY.get(aliasKey.replace(/ /g, ""));
    if (!code) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const prefix = match.groups?.prefix ?? "";
    // "casque orange" or "alger" inside a longer word is excluded by the
    // boundaries; a bare Latin "l" prefix must not eat a real word ("lmila").
    mentions.push({ code, start, end, score: mentionScore(folded, start, end, prefix) });
  }
  return mentions;
}

/** The delivery wilaya: strongest cue wins; ties go to the first mention. */
export function chooseWilaya(mentions: readonly GeoMention[]): number | undefined {
  const totals = new Map<number, { score: number; first: number }>();
  for (const mention of mentions) {
    const prior = totals.get(mention.code);
    totals.set(mention.code, {
      score: (prior?.score ?? 0) + mention.score,
      first: Math.min(prior?.first ?? Infinity, mention.start),
    });
  }
  let best: { code: number; score: number; first: number } | undefined;
  for (const [code, total] of totals) {
    if (
      !best ||
      total.score > best.score ||
      (total.score === best.score && total.first < best.first)
    ) {
      best = { code, ...total };
    }
  }
  return best?.code;
}

export function wilayaName(code: number | undefined): string | undefined {
  return code === undefined ? undefined : WILAYA_NAME.get(code);
}

/** Canonical French wilaya name for any spelling, number or Arabic form. */
export function canonicalWilaya(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const key = foldKey(value);
  if (/^\d{1,2}$/.test(key)) return wilayaName(Number(key));
  const direct = ALIAS_BY_KEY.get(key) ?? ALIAS_BY_KEY.get(key.replace(/^ال/u, ""));
  if (direct) return wilayaName(direct);
  return wilayaName(chooseWilaya(findWilayaMentions(fold(value))));
}

// ─── Communes ────────────────────────────────────────────────────────────────

interface CommuneAlias {
  key: string;
  name: string;
  wilayaCode: number;
}

const COMMUNE_ALIASES: CommuneAlias[] = [];
for (const commune of communes) {
  for (const label of [commune.name, commune.nameAr]) {
    const key = foldKey(label);
    // Short names ("Sig", "Tit", "Aziz") collide with ordinary words.
    if (key.replace(/ /g, "").length < 5) continue;
    if (ALIAS_BY_KEY.has(key)) continue;
    COMMUNE_ALIASES.push({ key, name: commune.name, wilayaCode: commune.wilayaCode });
  }
}
const COMMUNE_BY_KEY = new Map<string, CommuneAlias[]>();
for (const alias of COMMUNE_ALIASES) {
  COMMUNE_BY_KEY.set(alias.key, [...(COMMUNE_BY_KEY.get(alias.key) ?? []), alias]);
}
const COMMUNE_PATTERN = new RegExp(
  `${B_BEFORE}(?:${ARABIC_PREFIX})?(?<name>${[...COMMUNE_BY_KEY.keys()]
    .sort((left, right) => right.length - left.length)
    .map((key) => escapeRegExp(key).replace(/ /g, "[\\s'-]*"))
    .join("|")})${B_AFTER}`,
  "gu",
);

export interface CommuneMention {
  name: string;
  wilayaCode: number;
  start: number;
  end: number;
}

/**
 * A commune is kept only when it is consistent: inside the chosen wilaya, or
 * (with no wilaya) unambiguous and long enough to be deliberate.
 */
export function findCommune(folded: string, wilayaCode: number | undefined): CommuneMention | undefined {
  for (const match of folded.matchAll(COMMUNE_PATTERN)) {
    const key = (match.groups?.name ?? "").replace(/[\s'-]+/g, " ");
    const candidates = COMMUNE_BY_KEY.get(key) ?? [];
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (wilayaCode !== undefined) {
      const inside = candidates.find((candidate) => candidate.wilayaCode === wilayaCode);
      if (inside) return { name: inside.name, wilayaCode, start, end };
      continue;
    }
    const wilayaCodes = new Set(candidates.map((candidate) => candidate.wilayaCode));
    if (wilayaCodes.size === 1 && key.replace(/ /g, "").length >= 6) {
      const only = candidates[0]!;
      return { name: only.name, wilayaCode: only.wilayaCode, start, end };
    }
  }
  return undefined;
}
