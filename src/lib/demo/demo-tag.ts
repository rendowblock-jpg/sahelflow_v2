/**
 * The one client-safe statement of how sample (demo) data is tagged.
 *
 * FD-052 / FD-054: isolation is id-prefix based. Every row the sample
 * workspace seeds carries an id that starts with `demo-` (for example
 * `demo-conversation-04`), and removal deletes by that same prefix
 * (`algerian-demo.ts`, `algerian-demo-lifecycle.ts`). There is no boolean flag.
 *
 * This file has no `server-only` import so the inbox (a client component tree)
 * can mark a sample row with exactly the tag the server deletes by. A contract
 * test reads both server files and fails if their literal drifts from this one.
 */
export const DEMO_ID_PREFIX = "demo-";

export function isDemoId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(DEMO_ID_PREFIX);
}
