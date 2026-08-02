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

function assertSessionId(sessionId: string): void {
  if (!sessionId || sessionId !== sessionId.trim() || sessionId.length > 256) {
    throw new TypeError("Team session ID must be exact");
  }
}

async function setTeamSessionCookie(
  secret: string,
  sessionId: string,
): Promise<void> {
  const token = await createSessionToken(secret, SESSION_TTL_MS, sessionId);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

async function requireSigningSecret(): Promise<string> {
  const secret = await getAuthSecret();
  if (!secret) {
    throw new SahelFlowError(
      "Authentication authority is temporarily unavailable",
      "AUTH_SECRET_UNAVAILABLE",
      503,
    );
  }
  return secret;
}

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
  assertSessionId(sessionId);
  const secret = await requireSigningSecret();

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

  await setTeamSessionCookie(secret, sessionId);
  return Object.freeze({
    sessionId,
    issuedAt,
    replayed: Boolean(existing),
  });
}

/**
 * Replace the exact current database session with a team-directory session.
 * The team credential and new durable binding are committed first; this
 * transaction then makes the old signed token unusable and activates the new one.
 */
export async function rotateTeamDatabaseSession(
  currentSessionId: string,
  newSessionId: string,
  ip?: string,
): Promise<EstablishedTeamSession> {
  assertSessionId(currentSessionId);
  assertSessionId(newSessionId);
  if (currentSessionId === newSessionId) {
    throw new TypeError("Team reauthentication must rotate the session ID");
  }

  const secret = await requireSigningSecret();
  const issuedAt = new Date();
  await db.$transaction(async (tx) => {
    const revoked = await tx.session.updateMany({
      where: { id: currentSessionId, revokedAt: null },
      data: { revokedAt: issuedAt },
    });
    if (revoked.count !== 1) {
      throw new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
    }
    await tx.session.create({
      data: {
        id: newSessionId,
        issuedAt,
        lastSeenAt: issuedAt,
        ip: ip ?? null,
      },
    });
  });

  await setTeamSessionCookie(secret, newSessionId);
  return Object.freeze({
    sessionId: newSessionId,
    issuedAt,
    replayed: false,
  });
}
