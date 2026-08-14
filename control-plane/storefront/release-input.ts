import { ID, ITEM_KEY, WILAYA, validPublicArtifact } from "./shared";
import type { PublicArtifact } from "./shared";

export type ReleaseAllocation = {
  itemKey: string;
  unitPriceDzd: number;
  quantity: number;
};

export type ReleaseShippingRule = {
  wilayaCode: string;
  deliveryMode: "home" | "desk";
  feeDzd: number;
};

export type ParsedReleaseInput = {
  workspaceId: string;
  releaseId: string;
  parentReleaseId: string | null;
  templateId: "sahara" | "atlas" | "oasis";
  locale: "ar" | "fr" | "en";
  publicArtifact: PublicArtifact;
  allocations: ReleaseAllocation[];
  shippingRules: ReleaseShippingRule[];
};

export function parseReleaseInput(value: unknown): ParsedReleaseInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const workspaceId = String(input.workspaceId ?? "");
  const releaseId = String(input.releaseId ?? "");
  const parentReleaseId =
    input.parentReleaseId === null ? null : String(input.parentReleaseId ?? "");
  const templateId = input.templateId;
  const locale = input.locale;
  if (
    !ID.test(workspaceId) ||
    !ID.test(releaseId) ||
    (parentReleaseId !== null && !ID.test(parentReleaseId)) ||
    (templateId !== "sahara" && templateId !== "atlas" && templateId !== "oasis") ||
    (locale !== "ar" && locale !== "fr" && locale !== "en") ||
    !validPublicArtifact(input.publicArtifact) ||
    input.publicArtifact.theme.template !== templateId ||
    !Array.isArray(input.allocations) ||
    !Array.isArray(input.shippingRules)
  ) return null;

  const allocations: ReleaseAllocation[] = [];
  const allocationKeys = new Set<string>();
  for (const raw of input.allocations) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const itemKey = String(row.itemKey ?? "");
    const unitPriceDzd = Number(row.unitPriceDzd);
    const quantity = Number(row.quantity);
    if (
      !ITEM_KEY.test(itemKey) ||
      allocationKeys.has(itemKey) ||
      !Number.isSafeInteger(unitPriceDzd) ||
      unitPriceDzd < 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > 1_000_000
    ) return null;
    allocationKeys.add(itemKey);
    allocations.push({ itemKey, unitPriceDzd, quantity });
  }
  const productKeys = new Set(input.publicArtifact.products.map((product) => product.itemKey));
  if (
    productKeys.size !== allocationKeys.size ||
    [...productKeys].some((key) => !allocationKeys.has(key))
  ) return null;

  const shippingRules: ReleaseShippingRule[] = [];
  const shippingKeys = new Set<string>();
  for (const raw of input.shippingRules) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const wilayaCode = String(row.wilayaCode ?? "");
    const deliveryMode = row.deliveryMode;
    const feeDzd = Number(row.feeDzd);
    const key = `${wilayaCode}:${String(deliveryMode)}`;
    if (
      !WILAYA.test(wilayaCode) ||
      (deliveryMode !== "home" && deliveryMode !== "desk") ||
      !Number.isSafeInteger(feeDzd) ||
      feeDzd < 0 ||
      feeDzd > 100_000 ||
      shippingKeys.has(key)
    ) return null;
    shippingKeys.add(key);
    shippingRules.push({ wilayaCode, deliveryMode, feeDzd });
  }
  if (shippingRules.length < 1) return null;

  return {
    workspaceId,
    releaseId,
    parentReleaseId,
    templateId,
    locale,
    publicArtifact: input.publicArtifact,
    allocations,
    shippingRules,
  };
}
