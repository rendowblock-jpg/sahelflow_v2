import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { logger } from "@/lib/logger";
import { SahelFlowError } from "@/types/errors";
import { signedEntitlementSchema, type SignedEntitlement } from "./entitlement";
import { assessOnlineTrialCandidate } from "./online-trial-candidate";

const TRIAL_ENDPOINT_TIMEOUT_MS = 7_500;
const TRIAL_ROUTE_SEPARATOR = "|";
const TERMINAL_TRIAL_REJECTION_CODES = new Set(["invalid_json", "invalid_request"]);

type TrialEndpointRole = "primary" | "recovery";
type TrialFailureKind =
  | "dns"
  | "connect"
  | "tls"
  | "timeout"
  | "transport"
  | "http"
  | "invalid_response"
  | "invalid_entitlement";

type TrialEndpoint = Readonly<{
  role: TrialEndpointRole;
  origin: URL;
}>;

type TrialAttemptDiagnostic = Readonly<{
  role: TrialEndpointRole;
  host: string;
  failure: TrialFailureKind;
  status?: number;
}>;

function nativeDeviceBinding(): string {
  const binding = process.env.SF_DEVICE_BINDING;
  if (!binding || !/^sfdb1_[0-9a-f]{64}$/.test(binding)) {
    throw new SahelFlowError(
      "Native device binding is unavailable",
      "LICENSE_DEVICE_BINDING_UNAVAILABLE",
      503,
    );
  }
  return binding;
}

function configuredOrigins(raw: string | undefined): string[] {
  if (!raw) {
    throw new SahelFlowError(
      "Online trial service is not configured",
      "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
      503,
    );
  }
  const routes = raw.split(TRIAL_ROUTE_SEPARATOR);
  if (
    routes.length < 1 ||
    routes.length > 2 ||
    routes.some((value) => value.length === 0 || value.trim() !== value)
  ) {
    throw new SahelFlowError(
      "Online trial service route set is misconfigured",
      "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
      503,
    );
  }
  return routes;
}

function configuredEndpoints(): TrialEndpoint[] {
  const roles: TrialEndpointRole[] = ["primary", "recovery"];
  const endpoints: TrialEndpoint[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of configuredOrigins(process.env.SF_LICENSE_SERVICE_URL).entries()) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new SahelFlowError(
        `Online trial ${roles[index] ?? "recovery"} service is misconfigured`,
        "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
        503,
      );
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new SahelFlowError(
        `Online trial ${roles[index] ?? "recovery"} service uses an unsupported protocol`,
        "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
        503,
      );
    }
    if (seen.has(parsed.origin)) continue;
    seen.add(parsed.origin);
    endpoints.push({ role: roles[index] ?? "recovery", origin: parsed });
  }
  return endpoints;
}

function errorCode(error: unknown): string | null {
  const candidate = error as { code?: unknown; cause?: unknown } | null;
  if (typeof candidate?.code === "string") return candidate.code.toUpperCase();
  const cause = candidate?.cause as { code?: unknown } | null;
  return typeof cause?.code === "string" ? cause.code.toUpperCase() : null;
}

function classifyTransportFailure(error: unknown): TrialFailureKind {
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  const code = errorCode(error);
  if (!code) return "transport";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (
    code.includes("CERT") ||
    code.includes("TLS") ||
    code.includes("SSL") ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID"
  ) {
    return "tls";
  }
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETDOWN",
      "ENETUNREACH",
      "ETIMEDOUT",
    ].includes(code)
  ) {
    return "connect";
  }
  return "transport";
}

async function canonicalTrialRejection(response: Response): Promise<string | null> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const code = (value as { error?: unknown }).error;
  return typeof code === "string" && TERMINAL_TRIAL_REJECTION_CODES.has(code)
    ? code
    : null;
}

function recordFailure(diagnostic: TrialAttemptDiagnostic): void {
  logger.warn("license.trial.endpoint-failed", diagnostic);
}

function diagnosticSummary(diagnostics: readonly TrialAttemptDiagnostic[]): string {
  return diagnostics
    .map(
      ({ role, failure, status }) =>
        `${role}:${failure}${status === undefined ? "" : `:${status}`}`,
    )
    .join(",");
}

export async function requestOnlineTrial(
  shop: ShopContext,
  fetcher: typeof fetch = fetch,
): Promise<SignedEntitlement> {
  const endpoints = configuredEndpoints();
  const requestBody = JSON.stringify({
    workspaceId: shop.workspaceId,
    installationId: shop.installationId,
    deviceBinding: nativeDeviceBinding(),
    appVersion: process.env.APP_VERSION ?? "1.0.0-internal.14",
  });
  const diagnostics: TrialAttemptDiagnostic[] = [];

  for (const candidate of endpoints) {
    let response: Response;
    try {
      response = await fetcher(new URL("/v1/trials", candidate.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal: AbortSignal.timeout(TRIAL_ENDPOINT_TIMEOUT_MS),
      });
    } catch (error) {
      const diagnostic: TrialAttemptDiagnostic = {
        role: candidate.role,
        host: candidate.origin.host,
        failure: classifyTransportFailure(error),
      };
      diagnostics.push(diagnostic);
      recordFailure(diagnostic);
      continue;
    }

    if (response.status === 429) {
      recordFailure({
        role: candidate.role,
        host: candidate.origin.host,
        failure: "http",
        status: response.status,
      });
      throw new SahelFlowError(
        "Online trial service rate limit reached; retry later",
        "LICENSE_TRIAL_RATE_LIMITED",
        429,
      );
    }

    if (!response.ok) {
      const diagnostic: TrialAttemptDiagnostic = {
        role: candidate.role,
        host: candidate.origin.host,
        failure: "http",
        status: response.status,
      };
      diagnostics.push(diagnostic);
      recordFailure(diagnostic);

      const rejection = await canonicalTrialRejection(response);
      if (!rejection) continue;
      throw new SahelFlowError(
        "Online trial service rejected the request",
        "LICENSE_TRIAL_ISSUANCE_FAILED",
        409,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const parsed = signedEntitlementSchema.safeParse(body);
    if (!parsed.success) {
      const diagnostic: TrialAttemptDiagnostic = {
        role: candidate.role,
        host: candidate.origin.host,
        failure: "invalid_response",
      };
      diagnostics.push(diagnostic);
      recordFailure(diagnostic);
      continue;
    }

    if ((await assessOnlineTrialCandidate(parsed.data, shop)) === "retry") {
      const diagnostic: TrialAttemptDiagnostic = {
        role: candidate.role,
        host: candidate.origin.host,
        failure: "invalid_entitlement",
      };
      diagnostics.push(diagnostic);
      recordFailure(diagnostic);
      continue;
    }

    return parsed.data;
  }

  const summary = diagnosticSummary(diagnostics);
  if (
    diagnostics.some(
      ({ failure }) =>
        failure === "invalid_response" || failure === "invalid_entitlement",
    )
  ) {
    throw new SahelFlowError(
      `Online trial service returned no authoritative entitlement response (${summary})`,
      "LICENSE_TRIAL_RESPONSE_INVALID",
      503,
    );
  }
  throw new SahelFlowError(
    `Online trial service could not be reached through any configured route (${summary})`,
    "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
    503,
  );
}
