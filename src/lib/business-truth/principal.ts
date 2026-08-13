import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  isTrustedActorContext,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import type { CanonicalOrderSource } from "@/lib/orders/manual-order-authority";
import { SahelFlowError } from "@/types/errors";

const TRUSTED_BUSINESS_PRINCIPAL = Symbol("sahelflow.trusted-business-principal");

export type BusinessPrincipalKind =
  | "authenticated-owner"
  | "system"
  | "ai"
  | "provider"
  | "source"
  | "test";

export interface TrustedBusinessPrincipal {
  readonly kind: BusinessPrincipalKind;
  readonly subjectId: string;
  readonly auditActor: string;
  readonly [TRUSTED_BUSINESS_PRINCIPAL]: true;
}

export type BusinessPrincipalContext = ServiceContext & {
  readonly businessPrincipal?: TrustedBusinessPrincipal;
};

function principalError(message: string): SahelFlowError {
  return new SahelFlowError(message, "TRUSTED_BUSINESS_PRINCIPAL", 500);
}

function normalizedSubject(subjectId: string): string {
  const value = subjectId.trim();
  if (!value) throw principalError("Trusted business principal subject must not be empty");
  if (value.length > 200) throw principalError("Trusted business principal subject is too long");
  return value;
}

function createPrincipal(
  kind: BusinessPrincipalKind,
  subjectId: string,
): TrustedBusinessPrincipal {
  const subject = normalizedSubject(subjectId);
  return Object.freeze({
    kind,
    subjectId: subject,
    auditActor: `${kind}:${subject}`,
    [TRUSTED_BUSINESS_PRINCIPAL]: true as const,
  });
}

function isTrustedPrincipal(value: unknown): value is TrustedBusinessPrincipal {
  return Boolean(
    value &&
      typeof value === "object" &&
      TRUSTED_BUSINESS_PRINCIPAL in value &&
      (value as { [TRUSTED_BUSINESS_PRINCIPAL]?: unknown })[
        TRUSTED_BUSINESS_PRINCIPAL
      ] === true,
  );
}

export function systemBusinessPrincipal(
  source: "automation-worker" | "migration" | "reconciliation" | "scheduler",
): TrustedBusinessPrincipal {
  return createPrincipal("system", source);
}

export function aiBusinessPrincipal(sessionId: string): TrustedBusinessPrincipal {
  return createPrincipal("ai", sessionId);
}

export function providerBusinessPrincipal(
  provider: "whatsapp" | "yalidine" | "maystro" | "zrexpress" | "ecotrack",
): TrustedBusinessPrincipal {
  return createPrincipal("provider", provider);
}

/**
 * Mint authorship for an externally initiated order only after the server has
 * validated the source boundary. Request bodies can never construct this sealed
 * principal directly.
 */
export function sourceBusinessPrincipal(
  source: CanonicalOrderSource,
  sourceIdentity: string,
): TrustedBusinessPrincipal {
  const identity = sourceIdentity.trim();
  if (!identity) throw principalError("Canonical source identity must not be empty");
  return createPrincipal("source", `${source}:${identity}`);
}

export function businessPrincipalFromTrustedActor(
  context: TrustedActorContext,
): TrustedBusinessPrincipal {
  if (!isTrustedActorContext(context)) {
    throw principalError("Business principal requires a server-minted trusted actor");
  }
  switch (context.actor.kind) {
    case "compatibility_local_owner":
      return createPrincipal(
        "authenticated-owner",
        `compatibility_local_owner:${context.actor.sessionId}`,
      );
    case "person":
      return createPrincipal(
        "authenticated-owner",
        `person:${context.actor.personId}:session:${context.actor.sessionId}`,
      );
    case "system":
      return createPrincipal("system", context.actor.serviceId);
  }
}

/**
 * Test-only factory for proving owner-session renewal behavior without importing
 * Next.js cookies. It is deliberately unavailable in production execution.
 */
export function testAuthenticatedOwnerBusinessPrincipal(
  sessionId: string,
): TrustedBusinessPrincipal {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw principalError(
      "The authenticated-owner test principal is unavailable outside tests",
    );
  }
  return createPrincipal("authenticated-owner", sessionId);
}

/** Test-only durable-person principal for replay-boundary integration tests. */
export function testAuthenticatedPersonBusinessPrincipal(
  personId: string,
  sessionId: string,
): TrustedBusinessPrincipal {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw principalError(
      "The authenticated-person test principal is unavailable outside tests",
    );
  }
  return createPrincipal(
    "authenticated-owner",
    `person:${personId}:session:${sessionId}`,
  );
}

/**
 * Determine whether a stored command actor and the current principal represent
 * the same default replay authority.
 *
 * Session IDs are ephemeral audit attributes. Durable person principals retain
 * replay access only to commands authored by the same person across session
 * rotation. Legacy single-owner/test principals remain mutually compatible but
 * cannot read a durable person's result. Other principal kinds remain
 * subject-specific unless an explicit replay authorizer grants access.
 */
export function hasDefaultBusinessReplayAuthority(
  storedAuditActor: string,
  principal: TrustedBusinessPrincipal,
): boolean {
  if (principal.kind === "authenticated-owner") {
    const personPrefix = "authenticated-owner:person:";
    const sessionMarker = ":session:";
    const currentAuditActor = principal.auditActor;

    if (currentAuditActor.startsWith(personPrefix)) {
      const currentSessionMarker = currentAuditActor.indexOf(
        sessionMarker,
        personPrefix.length,
      );
      if (currentSessionMarker < 0) return false;

      const currentPerson = currentAuditActor.slice(
        personPrefix.length,
        currentSessionMarker,
      );
      if (!currentPerson || !storedAuditActor.startsWith(personPrefix)) {
        return false;
      }

      const storedSessionMarker = storedAuditActor.indexOf(
        sessionMarker,
        personPrefix.length,
      );
      return (
        storedSessionMarker >= 0 &&
        storedAuditActor.slice(personPrefix.length, storedSessionMarker) ===
          currentPerson
      );
    }

    return (
      storedAuditActor.startsWith("authenticated-owner:") &&
      !storedAuditActor.startsWith(personPrefix)
    );
  }
  return storedAuditActor === principal.auditActor;
}

export async function resolveTrustedBusinessPrincipal(
  context: BusinessPrincipalContext,
): Promise<TrustedBusinessPrincipal> {
  if (context.businessPrincipal !== undefined) {
    if (!isTrustedPrincipal(context.businessPrincipal)) {
      throw principalError("Business execution context contains an untrusted principal");
    }
    return context.businessPrincipal;
  }

  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return createPrincipal("test", "vitest");
  }

  const { requireTrustedActor } = await import("@/lib/identity/trusted-actor");
  return businessPrincipalFromTrustedActor(await requireTrustedActor());
}
