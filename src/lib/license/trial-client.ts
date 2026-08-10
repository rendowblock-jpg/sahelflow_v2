import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { logger } from "@/lib/logger";
import { SahelFlowError } from "@/types/errors";
import { signedEntitlementSchema, type SignedEntitlement } from "./entitlement";

const TRIAL_ENDPOINT_TIMEOUT_MS = 7_500;

type TrialEndpointRole = "primary" | "recovery";
type TrialFailureKind =
  | "dns"
  | "connect"
  | "tls"
  | "timeout"
  | "transport"
  | "http"
  | "invalid_response";

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
  if (!raw.trimStart().startsWith("[")) return [raw];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > 2 ||
    parsed.some((value) => typeof value !== "string" || value.length === 0)
  ) {
    throw new SahelFlowError(
      "Online trial service route set is misconfigured",
      "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
      503,
    );
  }
  return parsed as string[];
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

function retryableHttpStatus(status: number): boolean {
  return [404, 405, 408, 421, 425].includes(status) || status >= 500;
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
      if (retryableHttpStatus(response.status)) continue;
      throw new SahelFlowError(
        "Online trial service rejected the request",
        "LICENSE_TRIAL_ISSUANCE_FAILED",
        response.status >= 500 ? 503 : 409,
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
    return parsed.data;
  }

  const summary = diagnosticSummary(diagnostics);
  if (diagnostics.some(({ failure }) => failure === "invalid_response")) {
    throw new SahelFlowError(
      `Online trial service returned no valid entitlement response (${summary})`,
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
