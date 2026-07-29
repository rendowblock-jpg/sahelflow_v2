export interface ManualDecisionReceipt {
  idempotencyKey: string;
  expectedVersion: number;
}

/**
 * Return an existing decision receipt without invoking the preflight factory.
 * This is the critical lost-response rule: retry the original key and optimistic
 * version even when the server has already committed a new status/version.
 */
export async function resolveManualDecisionReceipt(
  cache: Map<string, ManualDecisionReceipt>,
  target: string,
  create: () => Promise<ManualDecisionReceipt>,
): Promise<ManualDecisionReceipt> {
  const existing = cache.get(target);
  if (existing) return existing;
  const receipt = await create();
  cache.set(target, receipt);
  return receipt;
}
