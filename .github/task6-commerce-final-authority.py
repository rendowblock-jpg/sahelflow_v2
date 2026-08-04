from pathlib import Path

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one exact match in {path}: {old[:120]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Add separate run-level provider contract authority without changing the
# canonical source principal (`integration:<id>`).
replace_once(
    "prisma/models/commerce-runtime.prisma",
    "  sourceIdentity     String\n  status             String    @default(\"queued\")\n",
    "  sourceIdentity        String\n  credentialFingerprint String    @default(\"\")\n  endpointFingerprint   String    @default(\"\")\n  status                String    @default(\"queued\")\n",
)

migration = ROOT / "prisma/migrations/20260804043000_phase3_commerce_credential_contract/migration.sql"
migration.parent.mkdir(parents=True, exist_ok=True)
migration.write_text(
    '''-- Phase 3 Task 6: bind each provider-page run to one exact credential
-- and endpoint contract without changing canonical commerce source identity.

ALTER TABLE "CommerceSyncRun"
  ADD COLUMN "credentialFingerprint" TEXT NOT NULL DEFAULT '';

ALTER TABLE "CommerceSyncRun"
  ADD COLUMN "endpointFingerprint" TEXT NOT NULL DEFAULT '';
''',
    encoding="utf-8",
)

# Credential/endpoint fingerprints and monotonic watermark helper.
replace_once(
    "src/lib/integrations/ecommerce/runtime-contracts.ts",
    'import type { EcommercePlatform, NormalizedOrder } from "./types";\n',
    'import { SahelFlowError } from "@/types/errors";\nimport type {\n  EcommerceCredentials,\n  EcommercePlatform,\n  NormalizedOrder,\n} from "./types";\n',
)
replace_once(
    "src/lib/integrations/ecommerce/runtime-contracts.ts",
    '''export function commerceActiveKey(platform: EcommercePlatform): string {
  return `${COMMERCE_RUN_ACTIVE_KEY_PREFIX}:${platform}`;
}

export function commerceItemIdentity''',
    '''export function commerceActiveKey(platform: EcommercePlatform): string {
  return `${COMMERCE_RUN_ACTIVE_KEY_PREFIX}:${platform}`;
}

export interface CommerceCredentialContract {
  credentialFingerprint: string;
  endpointFingerprint: string;
}

function normalizedShopifyShop(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\\/\\//, "")
    .replace(/\\/.*$/, "")
    .replace(/\\.myshopify\\.com$/, "");
}

function normalizedWooOrigin(value: string): string {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\\/+$/, "");
  }
}

export function commerceCredentialContract(
  platform: EcommercePlatform,
  credentials: EcommerceCredentials,
): CommerceCredentialContract {
  if (platform === "shopify") {
    if (!("shop" in credentials) || !("accessToken" in credentials)) {
      throw new SahelFlowError(
        "Shopify credential contract is invalid",
        "COMMERCE_CREDENTIAL_CONTRACT_INVALID",
        409,
      );
    }
    return {
      credentialFingerprint: commerceHash({
        version: "commerce-credential-v1",
        platform,
        accessToken: credentials.accessToken.trim(),
      }),
      endpointFingerprint: commerceHash({
        version: "shopify-admin-2026-01",
        host: `${normalizedShopifyShop(credentials.shop)}.myshopify.com`,
      }),
    };
  }

  if (platform === "woocommerce") {
    if (
      !("siteUrl" in credentials) ||
      !("consumerKey" in credentials) ||
      !("consumerSecret" in credentials)
    ) {
      throw new SahelFlowError(
        "WooCommerce credential contract is invalid",
        "COMMERCE_CREDENTIAL_CONTRACT_INVALID",
        409,
      );
    }
    return {
      credentialFingerprint: commerceHash({
        version: "commerce-credential-v1",
        platform,
        consumerKey: credentials.consumerKey.trim(),
        consumerSecret: credentials.consumerSecret.trim(),
      }),
      endpointFingerprint: commerceHash({
        version: "woocommerce-wc-v3",
        origin: normalizedWooOrigin(credentials.siteUrl),
      }),
    };
  }

  if (
    !("accessToken" in credentials) ||
    "shop" in credentials ||
    "siteUrl" in credentials
  ) {
    throw new SahelFlowError(
      "YouCan credential contract is invalid",
      "COMMERCE_CREDENTIAL_CONTRACT_INVALID",
      409,
    );
  }
  return {
    credentialFingerprint: commerceHash({
      version: "commerce-credential-v1",
      platform,
      accessToken: credentials.accessToken.trim(),
    }),
    endpointFingerprint: commerceHash({
      version: "youcan-orders-v1",
      origin: "https://api.youcan.shop",
    }),
  };
}

export function maxCommerceWatermark(
  current: string,
  candidate: string,
): string {
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate > current ? candidate : current;
}

export function commerceItemIdentity''',
)

# Queue runs with an exact credential/endpoint contract while preserving stable
# sourceIdentity for canonical replay and existing-order authority.
replace_once(
    "src/lib/integrations/ecommerce/queue.ts",
    '''  commerceActiveKey,
  commerceHash,
  parseCommerceIntegrationConfig,
''',
    '''  commerceActiveKey,
  commerceCredentialContract,
  commerceHash,
  parseCommerceIntegrationConfig,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/queue.ts",
    '''  if (!(await loadEcommerceCredentials(context, platform))) {
    throw new SahelFlowError(
      `No credentials configured for ${platform}`,
      "COMMERCE_SYNC_CREDENTIALS_MISSING",
      409,
    );
  }

  const activeKey = commerceActiveKey(platform);''',
    '''  const credentials = await loadEcommerceCredentials(context, platform);
  if (!credentials) {
    throw new SahelFlowError(
      `No credentials configured for ${platform}`,
      "COMMERCE_SYNC_CREDENTIALS_MISSING",
      409,
    );
  }
  const credentialContract = commerceCredentialContract(platform, credentials);

  const activeKey = commerceActiveKey(platform);''',
)
replace_once(
    "src/lib/integrations/ecommerce/queue.ts",
    '''        integrationId: integration.id,
        sourceIdentity: `integration:${integration.id}`,
        status: "queued",
''',
    '''        integrationId: integration.id,
        sourceIdentity: `integration:${integration.id}`,
        credentialFingerprint: credentialContract.credentialFingerprint,
        endpointFingerprint: credentialContract.endpointFingerprint,
        status: "queued",
''',
)

# Processor: fence page commits by lease, verify the exact provider contract,
# retain a monotonic candidate watermark and release non-recoverable runs.
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''  COMMERCE_FETCH_MAX_ATTEMPTS,
  COMMERCE_LEASE_MS,
  commerceHash,
''',
    '''  COMMERCE_FETCH_MAX_ATTEMPTS,
  COMMERCE_LEASE_MS,
  commerceCredentialContract,
  commerceHash,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''  commerceItemIdentity,
  commerceRetryAt,
  parseCommerceIntegrationConfig,
''',
    '''  commerceItemIdentity,
  commerceRetryAt,
  maxCommerceWatermark,
  parseCommerceIntegrationConfig,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''  sourceIdentity: string;
  initialWatermark: string;
''',
    '''  sourceIdentity: string;
  credentialFingerprint: string;
  endpointFingerprint: string;
  initialWatermark: string;
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''      sourceIdentity: candidate.sourceIdentity,
      initialWatermark: candidate.initialWatermark,
''',
    '''      sourceIdentity: candidate.sourceIdentity,
      credentialFingerprint: candidate.credentialFingerprint,
      endpointFingerprint: candidate.endpointFingerprint,
      initialWatermark: candidate.initialWatermark,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''function leaseCutoff(): Date {
  return new Date(Date.now() - COMMERCE_LEASE_MS);
}

async function claimCommerceRun''',
    '''function leaseCutoff(): Date {
  return new Date(Date.now() - COMMERCE_LEASE_MS);
}

const TERMINAL_FETCH_AUTHORITY_ERRORS = new Set([
  "COMMERCE_SYNC_CREDENTIALS_MISSING",
  "COMMERCE_CREDENTIAL_CONTRACT_INVALID",
  "COMMERCE_CREDENTIAL_CONTRACT_DRIFT",
]);

function terminalFetchAuthorityError(error: unknown): boolean {
  return (
    error instanceof SahelFlowError &&
    TERMINAL_FETCH_AUTHORITY_ERRORS.has(error.code)
  );
}

async function claimCommerceRun''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''  const generationAttempts = await context.prisma.commerceSyncRunAttempt.count({
    where: {
      runId: run.id,
      phase: "fetch",
      detailJson: generationKey,
      state: { in: ["processing", "retrying", "failed"] },
    },
  });
  const dead = generationAttempts >= COMMERCE_FETCH_MAX_ATTEMPTS;
''',
    '''  const generationAttempts = await context.prisma.commerceSyncRunAttempt.count({
    where: {
      runId: run.id,
      phase: "fetch",
      detailJson: generationKey,
      state: { in: ["processing", "retrying", "failed"] },
    },
  });
  const terminalAuthorityFailure = terminalFetchAuthorityError(error);
  const dead =
    terminalAuthorityFailure ||
    generationAttempts >= COMMERCE_FETCH_MAX_ATTEMPTS;
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''        status: dead ? "dead_letter" : "retrying",
        leaseToken: null,
        lockedAt: null,
''',
    '''        status: dead ? "dead_letter" : "retrying",
        activeKey: terminalAuthorityFailure ? null : undefined,
        leaseToken: null,
        lockedAt: null,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''  const now = new Date();

  await context.prisma.$transaction(async (tx) => {
    await tx.commerceSyncPage.create({''',
    '''  const now = new Date();
  const candidateWatermark = maxCommerceWatermark(
    run.candidateWatermark,
    page.candidateWatermark,
  );

  await context.prisma.$transaction(async (tx) => {
    const authoritativeRun = await tx.commerceSyncRun.findFirst({
      where: {
        id: run.id,
        status: "fetching",
        leaseToken: run.leaseToken,
      },
      select: { id: true },
    });
    if (!authoritativeRun) {
      throw new SahelFlowError(
        "Commerce fetch lease was lost before page persistence",
        "COMMERCE_SYNC_LEASE_LOST",
        409,
      );
    }
    await tx.commerceSyncPage.create({''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''        candidateWatermark: page.candidateWatermark || run.candidateWatermark,
''',
    '''        candidateWatermark,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''    const adapter = getEcommerceAdapter(run.platform);
    const page = await adapter.fetchOrderPage(credentials, {
''',
    '''    const credentialContract = commerceCredentialContract(
      run.platform,
      credentials,
    );
    if (
      credentialContract.credentialFingerprint !== run.credentialFingerprint ||
      credentialContract.endpointFingerprint !== run.endpointFingerprint
    ) {
      throw new SahelFlowError(
        "Commerce credentials or provider endpoint changed after the run was queued",
        "COMMERCE_CREDENTIAL_CONTRACT_DRIFT",
        409,
      );
    }
    const adapter = getEcommerceAdapter(run.platform);
    const page = await adapter.fetchOrderPage(credentials, {
''',
)
replace_once(
    "src/lib/integrations/ecommerce/processor.ts",
    '''          data: {
            status: "dead_letter",
            lastErrorCode: "COMMERCE_WATERMARK_CONFLICT",
''',
    '''          data: {
            status: "dead_letter",
            activeKey: null,
            lastErrorCode: "COMMERCE_WATERMARK_CONFLICT",
''',
)

# Recovery/history must never advertise a terminal authority failure as safely
# retryable. Those runs release activeKey so a fresh bound run can be queued.
replace_once(
    "src/lib/integrations/ecommerce/recovery.ts",
    '''const RECOVERABLE_ITEM_STATES = ["quarantined", "dead_letter"] as const;
''',
    '''const RECOVERABLE_ITEM_STATES = ["quarantined", "dead_letter"] as const;
const TERMINAL_AUTHORITY_ERRORS = new Set([
  "COMMERCE_SYNC_CREDENTIALS_MISSING",
  "COMMERCE_CREDENTIAL_CONTRACT_INVALID",
  "COMMERCE_CREDENTIAL_CONTRACT_DRIFT",
]);
''',
)
replace_once(
    "src/lib/integrations/ecommerce/recovery.ts",
    '''function recoveryDecision(run: {
  status: string;
  fetchComplete: boolean;
  lastErrorCode: string | null;
''',
    '''function recoveryDecision(run: {
  status: string;
  activeKey: string | null;
  fetchComplete: boolean;
  lastErrorCode: string | null;
''',
)
replace_once(
    "src/lib/integrations/ecommerce/recovery.ts",
    '''  if (run.lastErrorCode === "COMMERCE_WATERMARK_CONFLICT") {
    return {
      mode: null,
      itemIds: [],
      blockCode: "COMMERCE_WATERMARK_CONFLICT",
    };
  }
  if (!run.fetchComplete && run.status === "dead_letter") {''',
    '''  if (run.lastErrorCode === "COMMERCE_WATERMARK_CONFLICT") {
    return {
      mode: null,
      itemIds: [],
      blockCode: "COMMERCE_WATERMARK_CONFLICT",
    };
  }
  if (
    run.lastErrorCode &&
    TERMINAL_AUTHORITY_ERRORS.has(run.lastErrorCode)
  ) {
    return {
      mode: null,
      itemIds: [],
      blockCode: "COMMERCE_CREDENTIAL_CONTRACT_DRIFT",
    };
  }
  if (!run.activeKey) {
    return { mode: null, itemIds: [], blockCode: "COMMERCE_RUN_REPLACED" };
  }
  if (!run.fetchComplete && run.status === "dead_letter") {''',
)
replace_once(
    "src/lib/integrations/ecommerce/recovery.ts",
    '''      id: true,
      platform: true,
      status: true,
''',
    '''      id: true,
      platform: true,
      status: true,
      activeKey: true,
''',
)
replace_once(
    "src/lib/integrations/ecommerce/recovery.ts",
    '''        decision.blockCode === "COMMERCE_WATERMARK_CONFLICT"
          ? "The integration watermark changed outside this run; queue a new sync after reconciling the integration state"
          : decision.blockCode === "COMMERCE_RUN_TERMINAL"
''',
    '''        decision.blockCode === "COMMERCE_WATERMARK_CONFLICT"
          ? "The integration watermark changed outside this run; queue a new sync after reconciling the integration state"
          : decision.blockCode === "COMMERCE_CREDENTIAL_CONTRACT_DRIFT"
            ? "The provider credential or endpoint contract changed; queue a new sync under the current contract"
          : decision.blockCode === "COMMERCE_RUN_TERMINAL"
''',
)

# Specific multilingual operator state.
for locale, text in {
    "en": "Credentials or the provider endpoint changed after this run was queued. Queue a new sync under the current connection.",
    "fr": "Les identifiants ou le point d’accès fournisseur ont changé après la mise en file. Lancez une nouvelle synchronisation avec la connexion actuelle.",
    "ar": "تغيرت بيانات الاعتماد أو نقطة اتصال المزود بعد إضافة هذا التشغيل إلى قائمة الانتظار. ابدأ مزامنة جديدة باستخدام الاتصال الحالي.",
}.items():
    marker = {
        "en": '    "commerce.runtime.watermarkConflict": "The integration watermark changed outside this run. Reconcile the integration state and queue a new sync.",\n',
        "fr": '    "commerce.runtime.watermarkConflict": "Le point de reprise de l’intégration a changé hors de cette exécution. Réconciliez l’intégration puis lancez une nouvelle synchronisation.",\n',
        "ar": '    "commerce.runtime.watermarkConflict": "تغيرت نقطة المزامنة خارج هذا التشغيل. قم بتسوية حالة التكامل ثم ابدأ مزامنة جديدة.",\n',
    }[locale]
    replace_once(
        "src/lib/i18n/commerce-runtime.ts",
        marker,
        marker + f'    "commerce.runtime.credentialDrift": "{text}",\n',
    )

replace_once(
    "src/components/settings/commerce-sync-recovery-panel.tsx",
    '''                        {run.recoveryBlockCode === "COMMERCE_WATERMARK_CONFLICT"
                          ? t("commerce.runtime.watermarkConflict")
                          : t("commerce.runtime.retryUnavailable")}
''',
    '''                        {run.recoveryBlockCode === "COMMERCE_WATERMARK_CONFLICT"
                          ? t("commerce.runtime.watermarkConflict")
                          : run.recoveryBlockCode ===
                              "COMMERCE_CREDENTIAL_CONTRACT_DRIFT"
                            ? t("commerce.runtime.credentialDrift")
                            : t("commerce.runtime.retryUnavailable")}
''',
)

# Add adversarial regressions without weakening the existing runtime suite.
test_path = ROOT / "src/lib/integrations/ecommerce/__tests__/durable-runtime.test.ts"
test_text = test_path.read_text(encoding="utf-8")
insert_at = test_text.rfind("\n});\n")
if insert_at < 0:
    raise SystemExit("durable runtime describe terminator missing")
new_tests = r'''

  it("retains the maximum candidate watermark across descending provider pages", async () => {
    fetchPageMock
      .mockResolvedValueOnce(
        page([], {
          nextCursor: "older-page",
          watermark: "2026-01-03T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        page([], {
          nextCursor: null,
          watermark: "2026-01-02T00:00:00Z",
        }),
      );

    const queued = await queueCommerceSync(context, "shopify", 1);
    await processNextCommerceFetch(context);
    await processNextCommerceFetch(context);
    expect(await finalizeCommerceRuns(context)).toBe(1);

    const run = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(run.candidateWatermark).toBe("2026-01-03T00:00:00Z");
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integration.config ?? "{}")).toMatchObject({
      watermark: "2026-01-03T00:00:00Z",
    });
  });

  it("fails closed on credential or endpoint drift without changing canonical source identity", async () => {
    const queued = await queueCommerceSync(context, "shopify", 1);
    const original = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    credentialsProvider.mockResolvedValue({
      shop: "different-shop",
      accessToken: "rotated-token",
    });

    expect(await processNextCommerceFetch(context)).toBe(true);
    expect(fetchPageMock).not.toHaveBeenCalled();
    const failed = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(failed).toMatchObject({
      status: "dead_letter",
      activeKey: null,
      lastErrorCode: "COMMERCE_CREDENTIAL_CONTRACT_DRIFT",
    });

    const replacement = await queueCommerceSync(context, "shopify", 1);
    const replacementRun = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: replacement.id },
    });
    expect(replacement.id).not.toBe(queued.id);
    expect(replacementRun.sourceIdentity).toBe(original.sourceIdentity);
    expect(replacementRun.credentialFingerprint).not.toBe(
      original.credentialFingerprint,
    );
  });

  it("releases a watermark-conflicted run so a reconciled sync can be queued", async () => {
    fetchPageMock.mockResolvedValueOnce(
      page([], { nextCursor: null, watermark: "wm-run" }),
    );
    const queued = await queueCommerceSync(context, "shopify", 1);
    await processNextCommerceFetch(context);
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    await rawDb.integration.update({
      where: { id: integration.id },
      data: {
        config: JSON.stringify({ watermark: "wm-external", lastSyncAt: "" }),
      },
    });

    expect(await finalizeCommerceRuns(context)).toBe(0);
    const conflicted = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(conflicted).toMatchObject({
      status: "dead_letter",
      activeKey: null,
      lastErrorCode: "COMMERCE_WATERMARK_CONFLICT",
    });

    const replacement = await queueCommerceSync(context, "shopify", 1);
    expect(replacement.id).not.toBe(queued.id);
    expect(replacement.initialWatermark).toBe("wm-external");
  });
'''
test_path.write_text(test_text[:insert_at] + new_tests + test_text[insert_at:], encoding="utf-8")

print("Task 6 final commerce authority repair applied")
