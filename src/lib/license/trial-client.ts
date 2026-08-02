import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import { signedEntitlementSchema, type SignedEntitlement } from "./entitlement";

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

export async function requestOnlineTrial(
  shop: ShopContext,
  fetcher: typeof fetch = fetch,
): Promise<SignedEntitlement> {
  const serviceUrl = process.env.SF_LICENSE_SERVICE_URL;
  if (!serviceUrl) {
    throw new SahelFlowError(
      "Online trial service is not configured",
      "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
      503,
    );
  }
  let response: Response;
  try {
    response = await fetcher(new URL("/v1/trials", serviceUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: shop.workspaceId,
        installationId: shop.installationId,
        deviceBinding: nativeDeviceBinding(),
        appVersion: process.env.APP_VERSION ?? "1.0.0-internal.13",
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SahelFlowError(
      "Online trial service could not be reached",
      "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
      503,
    );
  }
  if (!response.ok) {
    throw new SahelFlowError(
      "Online trial service rejected the request",
      "LICENSE_TRIAL_ISSUANCE_FAILED",
      response.status >= 500 ? 503 : 409,
    );
  }
  const parsed = signedEntitlementSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new SahelFlowError(
      "Online trial service returned an invalid entitlement",
      "LICENSE_TRIAL_RESPONSE_INVALID",
      503,
    );
  }
  return parsed.data;
}
