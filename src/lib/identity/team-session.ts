import "server-only";

import { cookies } from "next/headers";

import { AUTH_COOKIE, SESSION_TTL_MS } from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/crypto";
import { getAuthSecret } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";

export type EstablishedTeamSession = Readonly<{
  sessionId: string;
  issuedAt: Date;
  replayed: boolean;
}>;

/**
 * Persist or resume one exact team session and issue its signed cookie.
 *
 * The accepted-member directory commits first. A database failure cannot grant
 * access because every authenticated request still requires this Session row.
 * Retrying the same invitation resumes the stable session ID and completes the
 * local database/cookie boundary without creating another member.
 */
export async function establishTeamSession(
  sessionId: string,
  ip?: string,
): Promise<EstablishedTeamSession> {
  if (!sessionId || sessionId !== sessionId.trim() || sessionId.length > 256) {
    throw new TypeError("Team session ID must be exact");
  }

  const secret = await getAuthSecret();
  if (!secret) {
    throw new SahelFlowError(
      "Authentication authority is temporarily unavailable",
      "AUTH_SECRET_UNAVAILABLE",
      503,
    );
  }

  const existing = await db.session.findUnique({ where: { id: sessionId } });
  if (existing?.revokedAt) {
    throw new SahelFlowError(
      "The accepted member session was revoked before completion",
      "MEMBER_SESSION_RECOVERY_REQUIRED",
      409,
    );
  }

  const issuedAt = existing?.issuedAt ?? new Date();
  if (!existing) {
    await db.session.create({
      data: {
        id: sessionId,
        issuedAt,
        lastSeenAt: issuedAt,
        ip: ip ?? null,
      },
    });
  }

  const token = await createSessionToken(secret, SESSION_TTL_MS, sessionId);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return Object.freeze({
    sessionId,
    issuedAt,
    replayed: Boolean(existing),
  });
}
