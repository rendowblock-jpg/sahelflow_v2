/**
 * Constant-time string comparison.
 *
 * Uses a manual XOR loop to avoid timing-attack short-circuiting (JS `===`
 * and `!==` short-circuit on the first differing byte, leaking the secret
 * byte-by-byte via response timing).
 *
 * Returns false early if lengths differ — but this itself leaks length info.
 * For secrets of fixed length (cron secrets, API tokens), this is acceptable.
 * For variable-length secrets where length itself is sensitive, pad both
 * to the same length before comparing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
