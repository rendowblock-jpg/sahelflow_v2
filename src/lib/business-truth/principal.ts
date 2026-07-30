import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  isTrustedActorContext,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import { SahelFlowError } from "@/types/errors";

const TRUSTED_BUSINESS_PRINCIPAL = Symbol("sahelflow.trusted-business-principal");

export type BusinessPrincipalKind =
  | "authenticated-owner"
  | "system"
  | "ai"
  | "provider"
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
  provider: "yalidine" | "maystro" | "zrexpress" | "dhd",
): TrustedBusinessPrincipal {
  return createPrincipal("provider", provider);
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

/**
 * Determine whether a stored command actor and the current principal represent
 * the same default replay authority.
 *
 * Authenticated owner sessions are ephemeral audit identities, but this is a
 * single-owner, process-bound shop. Any currently authenticated owner session
 * therefore retains replay access to commands authored by an earlier owner
 * session in the same validated shop. System, AI, provider and test principals
 * remain subject-specific unless an explicit replay authorizer grants access.
 */
export function hasDefaultBusinessReplayAuthority(
  storedAuditActor: string,
  principal: TrustedBusinessPrincipal,
): boolean {
  if (principal.kind === "authenticated-owner") {
    return storedAuditActor.startsWith("authenticated-owner:");
  }
  return storedAuditActor === principal.auditActor;
}

/**
 * Resolve command authorship from trusted execution authority.
 *
 * Request handlers normally omit `businessPrincipal`; the resolver verifies the
 * authenticated cookie and binds the command to the current Session.id for
 * audit attribution. Trusted background boundaries must attach a principal
 * produced by one of the fixed factories above. Tests receive a sealed test
 * principal without importing the Next.js cookie runtime.
 */
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
