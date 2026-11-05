// When may the phone app replace its own shell by itself (W4SEC-07)? Pure rules, no clock, no storage, no DOM: the glue that owns
// those is auto-update.ts. Before this, a waiting update applied only when the seller tapped "update", so an old (possibly vulnerable)
// shell could stay for days.
//
// The rule in one line: a waiting update is applied at a SAFE moment (nothing unsent, nothing being typed, nothing in flight, not
// pairing); if it is 24 hours old and the moment never turns safe, the seller gets a prompt they can not dismiss.

/** A waiting update older than this is "overdue": it can not be put off any more, only held back by unsafe work, with a stronger prompt. */
export const UPDATE_MAX_WAIT_MS = 24 * 60 * 60 * 1000;
/** The phone asks the browser for a newer worker at most this often (on launch / return to foreground / back online). */
export const UPDATE_CHECK_MIN_GAP_MS = 60 * 60 * 1000;
/** While the stronger prompt is up because something was unsafe, the phone looks again this often, so it applies itself once it is safe. */
export const UPDATE_RECHECK_MS = 5 * 60 * 1000;

export type UpdatePhase = "idle" | "waiting" | "applying" | "reload";
/**
 * Why we are looking now. launch / resume = the seller just opened the app or came back to it (a natural moment for a fresh screen).
 * timer / online = nobody just arrived: only an OVERDUE update is applied then, a younger one waits for a real launch or resume.
 */
export type UpdateTrigger = "launch" | "resume" | "timer" | "online";
/** The four things that make a reload unsafe. true = unsafe. */
export type UpdateSafety = Readonly<{ unsentOutbox: boolean; composing: boolean; requestInFlight: boolean; pairing: boolean }>;
/** apply = take the update now; hold = not now, the small banner (the tap) stays; block = overdue and unsafe, show the stronger prompt; none = nothing to do. */
export type UpdateDecision = "apply" | "hold" | "block" | "none";

export function isOverdue(since: number | null, now: number): boolean {
  return since !== null && now - since >= UPDATE_MAX_WAIT_MS;
}

export function isSafe(safety: UpdateSafety): boolean {
  return !safety.unsentOutbox && !safety.composing && !safety.requestInFlight && !safety.pairing;
}

export function decideUpdate(input: Readonly<{ state: UpdatePhase; trigger: UpdateTrigger; safety: UpdateSafety; since: number | null; now: number }>): UpdateDecision {
  // "reload" = the new worker already runs but the reload was held back: it is still an update to finish.
  if (input.state !== "waiting" && input.state !== "reload") return "none";
  const overdue = isOverdue(input.since, input.now);
  if (!isSafe(input.safety)) return overdue ? "block" : "hold";
  // A younger WAITING update is not taken by a timer or a network blip, only when the seller arrives. A held reload is different: the new
  // worker already runs under the old page, so it is finished at the first safe look.
  if (input.state === "waiting" && (input.trigger === "timer" || input.trigger === "online") && !overdue) return "hold";
  return "apply";
}
