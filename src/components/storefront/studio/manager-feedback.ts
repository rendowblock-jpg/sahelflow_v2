import { translateServerError } from "@/lib/i18n/translate-server-error";

type Translate = Parameters<typeof translateServerError>[1];

/** Where a save / remove / change on a management card stands. */
export type ManagerPhase =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "saving" }>
  | Readonly<{ phase: "saved" }>
  | Readonly<{ phase: "failed"; reason: string }>;

export type ManagerVerb = "save" | "remove" | "change";

export type ManagerLine = Readonly<{ text: string; role: "status" | "alert" }> | null;

const P = "storefront.studioStates.manager.";

/** The words beside the button: progress and success are polite, failure is an alert with its reason. */
export function managerSaveLine(state: ManagerPhase, t: Translate, verb: ManagerVerb): ManagerLine {
  if (state.phase === "idle") return null;
  if (state.phase === "saving") {
    const key = verb === "remove" ? "removing" : verb === "change" ? "updating" : "saving";
    return { text: t(`${P}${key}`), role: "status" };
  }
  if (state.phase === "saved") {
    const key = verb === "remove" ? "removed" : verb === "change" ? "done" : "saved";
    return { text: t(`${P}${key}`), role: "status" };
  }
  if (verb === "save") {
    return { text: t("storefront.studioStates.save.notSaved", { reason: state.reason }), role: "alert" };
  }
  return { text: t(`${P}${verb === "remove" ? "notRemoved" : "notDone"}`, { reason: state.reason }), role: "alert" };
}

/** One action at a time, and only for someone allowed to manage. */
export function canStartManagerAction(input: Readonly<{ canManage: boolean; busy: boolean }>): boolean {
  return input.canManage && !input.busy;
}

/**
 * Why a call failed, in the seller's language. null = no answer at all.
 * A mapped server message is translated; anything else becomes the calm
 * wording, so developer text never reaches the screen.
 */
export function managerFailureReason(payload: Readonly<{ error?: string }> | null, t: Translate): string {
  if (payload === null) return t("storefront.studioStates.failure.noConnection");
  const fallback = t("storefront.studioStates.failure.serverRefused");
  const raw = payload.error;
  if (!raw) return fallback;
  const translated = translateServerError(raw, t, fallback);
  return translated === raw ? fallback : translated;
}

export type GateLoss = "otp" | "otpKey" | "turnstile" | "turnstileKey";

/**
 * What saving the gates form would switch off or erase, so the seller is told
 * before it happens. The server treats a secret of exactly "-" as "erase".
 */
export function gateRemovals(
  input: Readonly<{
    config: Readonly<{
      otpEnabled: boolean;
      turnstileEnabled: boolean;
      hasDzverifyApiKey: boolean;
      hasTurnstileSecretKey: boolean;
    }> | null;
    form: Readonly<{
      otpEnabled: boolean;
      turnstileEnabled: boolean;
      dzverifyApiKey: string;
      turnstileSecretKey: string;
    }>;
  }>,
): GateLoss[] {
  const { config, form } = input;
  if (config === null) return [];
  const losses: GateLoss[] = [];
  if (config.otpEnabled && !form.otpEnabled) losses.push("otp");
  if (config.hasDzverifyApiKey && form.dzverifyApiKey === "-") losses.push("otpKey");
  if (config.turnstileEnabled && !form.turnstileEnabled) losses.push("turnstile");
  if (config.hasTurnstileSecretKey && form.turnstileSecretKey === "-") losses.push("turnstileKey");
  return losses;
}
