from pathlib import Path
import re

ROOT = Path.cwd()


def replace_once(path: str, pattern: str, replacement: str, *, flags: int = 0) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"expected one match in {path}, found {count}: {pattern[:100]}")
    file_path.write_text(updated, encoding="utf-8")


def replace_marked(
    path: str,
    start: str,
    end: str,
    replacement: str,
    *,
    include_end: bool,
) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"start marker missing in {path}: {start}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"end marker missing in {path}: {end}")
    if include_end:
        end_index += len(end)
    file_path.write_text(
        text[:start_index] + replacement + text[end_index:],
        encoding="utf-8",
    )


provider_path = "src/lib/integrations/delivery/provider-capability.ts"
replace_once(
    provider_path,
    r'(const CONTRACT_VERSION: Record<DeliveryProvider, string> = \{.*?\n\};)',
    r'''\1

// Source-reviewed capability means the adapter and its documented contract have
// been reviewed in source, but a non-mutating connection probe is not being
// misrepresented as live proof of booking/tracking/fees behavior. The exact
// credential + endpoint contract must still have a current certified connection.
const SOURCE_REVIEWED_CAPABILITIES: Record<
  DeliveryProvider,
  readonly ProviderCapability[]
> = {
  yalidine: ["fees", "booking", "tracking"],
  maystro: ["fees", "booking", "tracking"],
  zrexpress: ["fees", "booking", "tracking"],
  // NOEST remains effect-disabled until the exact provider-issued create,
  // validate, tracking and fee contract is independently certified.
  noest: [],
};''',
    flags=re.S,
)

replace_once(
    provider_path,
    r'(export async function testAndCertifyProvider\(\n  context: ServiceContext,\n  provider: string,\n  actor: string,\n  reasonCode: string,\n\): Promise<\{ ok: boolean; message: string; expiresAt\?: string \}> \{\n  assertProvider\(provider\);)',
    r'''\1
  if (provider === "noest") {
    await invalidateProviderCertifications(
      context,
      provider,
      "provider_contract_unverified",
    );
    return {
      ok: false,
      message:
        "NOEST provider effects remain disabled until the exact provider-issued endpoint contract is independently certified.",
    };
  }''',
)

replace_marked(
    provider_path,
    "  const expiresAt = new Date(now.getTime() + CERTIFICATION_TTL_MS);",
    "  return { ...result, expiresAt: expiresAt.toISOString() };",
    '''  const expiresAt = new Date(now.getTime() + CERTIFICATION_TTL_MS);
  await context.prisma.$transaction(
    (["connection", "fees", "booking", "tracking"] as const).map(
      (capability) => {
        const sourceReviewed =
          capability !== "connection" &&
          SOURCE_REVIEWED_CAPABILITIES[provider].includes(capability);
        const status =
          capability === "connection"
            ? "certified"
            : sourceReviewed
              ? "source_reviewed"
              : "uncertified";
        const capabilityExpiresAt =
          capability === "connection" ? expiresAt : null;
        const evidence =
          capability === "connection"
            ? {
                probe: "non-mutating-provider-connection",
                message: result.message,
              }
            : sourceReviewed
              ? {
                  probe: "source-contract-review",
                  connectionRequired: true,
                }
              : {
                  probe: "provider-contract-unverified",
                  connectionRequired: true,
                };

        return context.prisma.providerCapabilityCertification.upsert({
          where: { provider_capability: { provider, capability } },
          create: {
            id: capabilityId(provider, capability),
            provider,
            capability,
            contractVersion,
            credentialFingerprint: fingerprint,
            endpointFingerprint: endpoints,
            status,
            certifiedBy: actor,
            reasonCode,
            evidenceJson: JSON.stringify(evidence),
            lastCheckedAt: now,
            certifiedAt: capability === "connection" ? now : null,
            expiresAt: capabilityExpiresAt,
            disabledAt: status === "uncertified" ? now : null,
          },
          update: {
            contractVersion,
            credentialFingerprint: fingerprint,
            endpointFingerprint: endpoints,
            status,
            certifiedBy: actor,
            reasonCode,
            evidenceJson: JSON.stringify(evidence),
            lastCheckedAt: now,
            certifiedAt: capability === "connection" ? now : null,
            expiresAt: capabilityExpiresAt,
            disabledAt: status === "uncertified" ? now : null,
            lastErrorCode: null,
          },
        });
      },
    ),
  );
  return { ...result, expiresAt: expiresAt.toISOString() };''',
    include_end=True,
)

replace_marked(
    provider_path,
    "export async function assertProviderCapability(",
    "export interface ProviderCertificationProjection",
    '''export async function assertProviderCapability(
  context: ServiceContext,
  provider: string,
  capability: ProviderCapability,
): Promise<void> {
  assertProvider(provider);
  if (providerCertificationBypassForLegacyTests()) return;
  const credentials = await loadDeliveryCredentials(context, provider);
  const fingerprint = credentialFingerprint(credentials);
  const endpoints = endpointFingerprint(credentials);
  const now = Date.now();

  const connection =
    await context.prisma.providerCapabilityCertification.findUnique({
      where: { provider_capability: { provider, capability: "connection" } },
    });
  const connectionValid =
    connection?.status === "certified" &&
    connection.contractVersion === CONTRACT_VERSION[provider] &&
    connection.credentialFingerprint === fingerprint &&
    connection.endpointFingerprint === endpoints &&
    connection.expiresAt instanceof Date &&
    connection.expiresAt.getTime() > now;

  if (capability === "connection") {
    if (connectionValid) return;
    throw new SahelFlowError(
      `${provider} connection is not certified for the current credentials and endpoint contract. Run the provider connection verification in Settings.`,
      "PROVIDER_CAPABILITY_UNCERTIFIED",
      409,
    );
  }

  const row = await context.prisma.providerCapabilityCertification.findUnique({
    where: { provider_capability: { provider, capability } },
  });
  const sourceReviewed = row?.status === "source_reviewed";
  const liveCertified =
    row?.status === "certified" &&
    row.expiresAt instanceof Date &&
    row.expiresAt.getTime() > now;
  const capabilityValid =
    connectionValid &&
    row?.contractVersion === CONTRACT_VERSION[provider] &&
    row.credentialFingerprint === fingerprint &&
    row.endpointFingerprint === endpoints &&
    (sourceReviewed || liveCertified);

  if (!capabilityValid) {
    throw new SahelFlowError(
      `${provider} ${capability} capability is not enabled for the current credentials and endpoint contract. A current connection plus source-reviewed or live-certified capability evidence is required.`,
      "PROVIDER_CAPABILITY_UNCERTIFIED",
      409,
    );
  }
}

''',
    include_end=False,
)

migration = ROOT / "prisma/migrations/20260804023000_provider_capability_evidence_levels/migration.sql"
migration.parent.mkdir(parents=True, exist_ok=True)
migration.write_text(
    '''-- Phase 3 Task 6: distinguish connection verification from capability evidence.\n\nUPDATE "ProviderCapabilityCertification"\nSET "status" = CASE\n      WHEN "provider" = 'noest' THEN 'uncertified'\n      ELSE 'source_reviewed'\n    END,\n    "reasonCode" = CASE\n      WHEN "provider" = 'noest' THEN 'provider_contract_unverified'\n      ELSE 'connection_probe_only'\n    END,\n    "certifiedAt" = NULL,\n    "expiresAt" = NULL,\n    "disabledAt" = CASE\n      WHEN "provider" = 'noest' THEN CURRENT_TIMESTAMP\n      ELSE NULL\n    END\nWHERE "capability" IN ('fees', 'booking', 'tracking')\n  AND "status" = 'certified';\n\nUPDATE "ProviderCapabilityCertification"\nSET "status" = 'uncertified',\n    "reasonCode" = 'provider_contract_unverified',\n    "certifiedAt" = NULL,\n    "expiresAt" = NULL,\n    "disabledAt" = CURRENT_TIMESTAMP\nWHERE "provider" = 'noest';\n''',
    encoding="utf-8",
)

provider_test = ROOT / "src/lib/integrations/delivery/__tests__/provider-capability.test.ts"
text = provider_test.read_text(encoding="utf-8")
text = text.replace(
    'it("certifies all runtime capabilities for one exact credential contract", async () => {',
    'it("verifies connection and records source-reviewed capability evidence", async () => {',
)
text = text.replace(
    '''    expect([...rows.values()].map((row) => row.capability).sort()).toEqual([\n      "booking",\n      "connection",\n      "fees",\n      "tracking",\n    ]);\n    await expect(\n      assertProviderCapability(context, "yalidine", "booking"),\n    ).resolves.toBeUndefined();''',
    '''    expect([...rows.values()].map((row) => row.capability).sort()).toEqual([\n      "booking",\n      "connection",\n      "fees",\n      "tracking",\n    ]);\n    expect(rows.get("yalidine:connection")?.status).toBe("certified");\n    expect(rows.get("yalidine:fees")?.status).toBe("source_reviewed");\n    expect(rows.get("yalidine:booking")?.status).toBe("source_reviewed");\n    expect(rows.get("yalidine:tracking")?.status).toBe("source_reviewed");\n    await expect(\n      assertProviderCapability(context, "yalidine", "booking"),\n    ).resolves.toBeUndefined();''',
)
insert_before = '  it("fails closed when credentials drift after certification", async () => {'
noest_test = '''  it("keeps NOEST effect capabilities disabled without an authoritative contract", async () => {\n    const { context, rows } = testContext();\n\n    const result = await testAndCertifyProvider(\n      context,\n      "noest",\n      "owner:test",\n      "manual_test",\n    );\n\n    expect(result.ok).toBe(false);\n    expect(harness.adapter.testConnection).not.toHaveBeenCalled();\n    expect(rows.size).toBe(0);\n    await expect(\n      assertProviderCapability(context, "noest", "booking"),\n    ).rejects.toMatchObject({ code: "PROVIDER_CAPABILITY_UNCERTIFIED" });\n  });\n\n'''
if insert_before not in text:
    raise SystemExit("provider capability test insertion point missing")
text = text.replace(insert_before, noest_test + insert_before, 1)
provider_test.write_text(text, encoding="utf-8")

source_contract = ROOT / "src/lib/integrations/delivery/__tests__/provider-authority-source-contract.test.ts"
text = source_contract.read_text(encoding="utf-8")
text = text.replace(
    'it("removes the undocumented DHD runtime and registers NOEST only with exact URLs", () => {',
    'it("removes DHD and keeps NOEST effects fail-closed pending authoritative contract evidence", () => {',
)
needle = '    expect(noest).not.toMatch(/const\\s+NOEST_(?:BASE|API)_URL/);\n'
addition = '''    expect(noest).not.toMatch(/const\\s+NOEST_(?:BASE|API)_URL/);\n\n    const capability = source(\n      "src/lib/integrations/delivery/provider-capability.ts",\n    );\n    expect(capability).toContain('noest: []');\n    expect(capability).toContain('provider === "noest"');\n    expect(capability).toContain('status === "source_reviewed"');\n'''
if needle not in text:
    raise SystemExit("source contract NOEST assertion point missing")
text = text.replace(needle, addition, 1)
source_contract.write_text(text, encoding="utf-8")

print("Task 6 capability evidence repair applied")
