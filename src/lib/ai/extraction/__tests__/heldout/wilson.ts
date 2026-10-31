/** Folding and Wilson 95% interval for the held-out scorer. */
const Z = 1.96;

export function fold(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\p{M}/gu, "")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function wilsonInterval(correct: number, total: number): { low: number; high: number } {
  if (total <= 0) return { low: 0, high: 1 };
  const p = correct / total;
  const z2 = Z * Z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = Z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    low: Math.max(0, (centre - margin) / denominator),
    high: Math.min(1, (centre + margin) / denominator),
  };
}

/** Smallest n whose Wilson 95% lower bound reaches `target` at the observed accuracy; null if it never can. */
export function messagesNeededForClaim(target: number, observedAccuracy: number): number | null {
  if (!(observedAccuracy > target)) return null;
  for (let n = 1; n <= 2_000_000; n++) {
    if (wilsonInterval(observedAccuracy * n, n).low >= target) return n;
  }
  return null;
}
