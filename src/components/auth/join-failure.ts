import { translateServerError } from "@/lib/i18n/translate-server-error";

import type { FormFailure } from "./form-focus";

export type JoinFailureBody = Readonly<{ error?: string; code?: string }>;

type Translate = (key: string) => string;

/** The server uses ONE answer for expired, used, revoked and unknown invitations (team-directory.ts). */
export function isInvitationUnavailable(body: JoinFailureBody): boolean {
  return body.code === "INVITATION_INVALID" || /invitation is invalid or unavailable/i.test(body.error ?? "");
}

export function classifyJoinFailure(body: JoinFailureBody, t: Translate): FormFailure {
  if (isInvitationUnavailable(body)) {
    return {
      field: "invite-token",
      title: t("firstRun.join.invalidTitle"),
      message: t("firstRun.join.invalidBody"),
      hint: t("firstRun.join.invalidNext"),
    };
  }
  return {
    field: "invite-token",
    message: translateServerError(body.error, t, t("phase5.join.failed")),
  };
}
