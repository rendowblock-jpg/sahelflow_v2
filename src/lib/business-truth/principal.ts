import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
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

/**
 * Resolve command authorship from trusted execution authority.
 *
 * Request handlers normally omit `businessPrincipal`; the resolver verifies the
 * authenticated cookie and binds the command to the current Session.id. Trusted
 * background boundaries must attach a principal produced by one of the fixed
 * factories above. Tests receive a sealed test principal without importing the
 * Next.js cookie runtime.
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

  const { getCurrentUserKey, requireAuth } = await import("@/lib/auth/server");
  await requireAuth();
  return createPrincipal("authenticated-owner", await getCurrentUserKey());
}
