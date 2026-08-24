import communes from "../../../data/communes.json";
import wilayas from "../../../data/wilayas.json";

type CanonicalWilaya = {
  code: number;
  name: string;
};

type CanonicalCommune = {
  wilayaCode: number;
  name: string;
};

function normalizeLocationKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const WILAYA_BY_KEY = new Map<string, CanonicalWilaya>();
for (const wilaya of wilayas) {
  const canonical = { code: wilaya.code, name: wilaya.name };
  for (const label of [wilaya.name, wilaya.nameAr]) {
    const key = normalizeLocationKey(label);
    if (key) WILAYA_BY_KEY.set(key, canonical);
  }
}

const COMMUNES_BY_KEY = new Map<string, CanonicalCommune[]>();
for (const commune of communes) {
  const canonical = { wilayaCode: commune.wilayaCode, name: commune.name };
  for (const label of [commune.name, commune.nameAr]) {
    const key = normalizeLocationKey(label);
    if (!key) continue;
    const existing = COMMUNES_BY_KEY.get(key);
    if (existing) {
      if (
        !existing.some(
          (entry) =>
            entry.wilayaCode === canonical.wilayaCode &&
            entry.name === canonical.name,
        )
      ) {
        existing.push(canonical);
      }
    } else {
      COMMUNES_BY_KEY.set(key, [canonical]);
    }
  }
}

function canonicalWilaya(value: unknown): CanonicalWilaya | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const key = normalizeLocationKey(value.trim());
  return key ? WILAYA_BY_KEY.get(key) ?? null : null;
}

function uniqueCommuneName(candidates: CanonicalCommune[]): string | null {
  const distinct = new Map<string, CanonicalCommune>();
  for (const candidate of candidates) {
    distinct.set(`${candidate.wilayaCode}:${candidate.name}`, candidate);
  }
  if (distinct.size !== 1) return null;
  return distinct.values().next().value?.name ?? null;
}

export function safeWilaya(value: unknown): string | null {
  return canonicalWilaya(value)?.name ?? null;
}

export function safeCommune(
  value: unknown,
  wilayaValue?: unknown,
): string | null {
  if (typeof value !== "string" || value.length > 120) return null;
  const key = normalizeLocationKey(value.trim());
  if (!key) return null;

  const candidates = COMMUNES_BY_KEY.get(key);
  if (!candidates || candidates.length === 0) return null;

  if (wilayaValue !== undefined && wilayaValue !== null) {
    const wilaya = canonicalWilaya(wilayaValue);
    if (!wilaya) return null;
    return uniqueCommuneName(
      candidates.filter((candidate) => candidate.wilayaCode === wilaya.code),
    );
  }

  // Without a wilaya discriminator, emit a canonical commune only when the
  // alias itself resolves to exactly one distinct commune. Ambiguous aliases
  // fail closed even when all matches belong to the same wilaya.
  return uniqueCommuneName(candidates);
}
