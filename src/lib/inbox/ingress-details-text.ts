import type { IngressNotice } from "@/hooks/inbox/use-inbox-ingress-health";
import type { Locale } from "@/lib/i18n";
import { getInboxHealthRuntimeTranslation } from "@/lib/i18n/inbox-health-runtime";
import { formatWaitAge } from "@/lib/inbox/wait-age";

/**
 * The plain text behind "Copy details" in the inbox status strip: what a seller can paste to
 * support. One fact per line, in the seller's language: counts, the age of the oldest waiting
 * message as words, and the failure code of what is waiting. It is built ONLY from those
 * fields: never a message, a name, a phone number or a customer id. Pure.
 */
export function buildIngressDetailsText(input: {
  locale: Locale;
  notices: IngressNotice[];
  recoveryCount: number;
  checkFailed: boolean;
}): string {
  const { locale, notices, recoveryCount, checkFailed } = input;
  const line = (key: string, values: Record<string, string | number> = {}) =>
    (getInboxHealthRuntimeTranslation(locale, `inboxHealth.copy.${key}`) ?? "").replace(
      /\{\{(\w+)\}\}/g,
      (_match, name: string) => String(values[name] ?? ""),
    );

  const lines = [line("title")];
  for (const notice of notices) {
    const { kind, count } = notice;
    if (kind === "lost") lines.push(line("lost", { count }));
    else if (kind === "unsupported") lines.push(line("unsupported", { count }));
    else if (kind === "unreachable") lines.push(line("unreachable"));
    else {
      lines.push(line(kind === "waiting" ? "waiting" : "stalled", { count }));
      if (kind === "waiting" && notice.minutes !== null) {
        lines.push(line("age", { age: formatWaitAge(locale, notice.minutes) }));
      }
      if (notice.failureCode) lines.push(line("code", { code: notice.failureCode }));
    }
  }
  if (recoveryCount > 0) lines.push(line("recovery", { count: recoveryCount }));
  if (checkFailed) lines.push(line("checkFailed"));
  return lines.join("\n");
}
