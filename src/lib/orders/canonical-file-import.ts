import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import type { MappedRow, ValidationFailure } from "@/lib/import/engine";
import { normalizePhone } from "@/lib/import/fields";

export const canonicalImportRowSchema = z
  .object({
    orderNumber: z.string().trim().max(200).optional(),
    customerName: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(40),
    wilaya: z.string().trim().min(1).max(120),
    commune: z.string().trim().max(120).optional(),
    address: z.string().trim().max(500).optional(),
    productName: z.string().trim().max(300).optional(),
    productSku: z.string().trim().max(120).optional(),
    variantName: z.string().trim().max(200).optional(),
    variantSku: z.string().trim().max(120).optional(),
    quantity: z.number().int().positive().max(999),
    unitPrice: z.number().int().nonnegative().optional(),
    deliveryCost: z.number().int().nonnegative().default(0),
    status: z.string().trim().max(80).optional(),
  })
  .superRefine((row, context) => {
    if (!row.productSku && !row.productName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productSku"],
        message: "Provide product SKU or exact product name",
      });
    }
    const status = row.status?.toLowerCase();
    if (status && !["pending", "draft"].includes(status)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Canonical order imports must enter as pending",
      });
    }
  });

export type CanonicalImportRow = z.infer<typeof canonicalImportRowSchema>;
export type CanonicalFileSource = "csv" | "xlsx";

interface CatalogVariant {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  isActive: boolean;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  productVariants: CatalogVariant[];
}

interface ResolvedImportRow {
  rowIndex: number;
  groupKey: string;
  customerName: string;
  phone: string;
  wilaya: string;
  commune: string;
  address: string;
  deliveryCost: number;
  productId: string;
  productName: string;
  productVariantId: string | null;
  productVariantName: string | null;
  quantity: number;
  serverUnitPrice: number;
  suppliedUnitPrice: number | null;
}

export interface PreparedCanonicalImportGroup {
  groupKey: string;
  sourceOrderId: string;
  rowIndices: number[];
  customer: {
    name: string;
    phone: string;
    wilaya: string;
    commune: string;
    address: string;
  };
  deliveryCost: number;
  items: Array<{
    productId: string;
    productVariantId: string | null;
    quantity: number;
  }>;
  previewItems: Array<{
    productName: string;
    productVariantName: string | null;
    quantity: number;
    serverUnitPrice: number;
  }>;
}

export interface CanonicalImportPreviewRow {
  rowIndex: number;
  groupKey: string;
  customerName: string;
  phone: string;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  serverUnitPrice: number;
  suppliedUnitPrice: number | null;
  priceChanged: boolean;
}

export interface PreparedCanonicalFileImport {
  source: CanonicalFileSource;
  fileHash: string;
  sourceIdentity: string;
  groups: PreparedCanonicalImportGroup[];
  preview: CanonicalImportPreviewRow[];
  invalid: ValidationFailure[];
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("fr-DZ");
}

function stableSourceOrderId(fileHash: string, groupKey: string): string {
  const groupHash = createHash("sha256").update(groupKey).digest("hex");
  return `import-${fileHash.slice(0, 24)}-${groupHash.slice(0, 24)}`;
}

function exactMatch<T>(
  candidates: T[],
  identity: string | undefined,
  read: (candidate: T) => string | null,
): T[] {
  const target = normalized(identity);
  if (!target) return [];
  return candidates.filter((candidate) => normalized(read(candidate)) === target);
}

function resolveCatalogRow(
  row: MappedRow<CanonicalImportRow>,
  products: CatalogProduct[],
): ResolvedImportRow {
  const data = row.data;
  const productMatches = data.productSku
    ? exactMatch(products, data.productSku, (product) => product.sku)
    : exactMatch(products, data.productName, (product) => product.name);
  if (productMatches.length === 0) {
    throw new Error("No active catalog product matches the imported identity");
  }
  if (productMatches.length > 1) {
    throw new Error("Imported product identity is ambiguous; provide an exact SKU");
  }

  const product = productMatches[0];
  if (!product) throw new Error("Catalog product authority is missing");
  const activeVariants = product.productVariants.filter(
    (variant) => variant.isActive,
  );
  let variant: CatalogVariant | null = null;
  if (activeVariants.length > 0) {
    const variantMatches = data.variantSku
      ? exactMatch(activeVariants, data.variantSku, (candidate) => candidate.sku)
      : exactMatch(activeVariants, data.variantName, (candidate) => candidate.name);
    if (variantMatches.length === 0) {
      throw new Error(
        "This product requires an exact active variant SKU or variant name",
      );
    }
    if (variantMatches.length > 1) {
      throw new Error("Imported variant identity is ambiguous; provide variant SKU");
    }
    variant = variantMatches[0] ?? null;
  } else if (data.variantSku || data.variantName) {
    throw new Error("Imported variant identity was supplied for a product without variants");
  }

  const phone = normalizePhone(data.phone);
  if (!/^0[5-7]\d{8}$/.test(phone)) {
    throw new Error("Invalid Algerian phone (must be 0[5-7]XXXXXXXX)");
  }
  const groupKey = data.orderNumber?.trim() || `row-${row.rowIndex + 1}`;

  return {
    rowIndex: row.rowIndex,
    groupKey,
    customerName: data.customerName,
    phone,
    wilaya: data.wilaya,
    commune: data.commune ?? "",
    address: data.address ?? "",
    deliveryCost: data.deliveryCost,
    productId: product.id,
    productName: product.name,
    productVariantId: variant?.id ?? null,
    productVariantName: variant?.name ?? null,
    quantity: data.quantity,
    serverUnitPrice: variant?.price ?? product.price,
    suppliedUnitPrice: data.unitPrice ?? null,
  };
}

function sameHeader(
  first: ResolvedImportRow,
  next: ResolvedImportRow,
): boolean {
  return (
    normalized(first.customerName) === normalized(next.customerName) &&
    first.phone === next.phone &&
    normalized(first.wilaya) === normalized(next.wilaya) &&
    normalized(first.commune) === normalized(next.commune) &&
    normalized(first.address) === normalized(next.address) &&
    first.deliveryCost === next.deliveryCost
  );
}

export async function prepareCanonicalFileImport(
  context: Pick<BusinessPrincipalContext, "prisma">,
  input: {
    source: CanonicalFileSource;
    fileHash: string;
    rows: MappedRow<CanonicalImportRow>[];
    structuralInvalid?: ValidationFailure[];
  },
): Promise<PreparedCanonicalFileImport> {
  const products = await context.prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    include: {
      productVariants: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const invalid = [...(input.structuralInvalid ?? [])];
  const resolved: ResolvedImportRow[] = [];
  for (const row of input.rows) {
    try {
      resolved.push(resolveCatalogRow(row, products));
    } catch (error) {
      invalid.push({
        rowIndex: row.rowIndex,
        errors: [error instanceof Error ? error.message : "Catalog resolution failed"],
      });
    }
  }

  const grouped = new Map<string, ResolvedImportRow[]>();
  for (const row of resolved) {
    const group = grouped.get(row.groupKey) ?? [];
    group.push(row);
    grouped.set(row.groupKey, group);
  }

  const groups: PreparedCanonicalImportGroup[] = [];
  const preview: CanonicalImportPreviewRow[] = [];
  for (const [groupKey, rows] of grouped) {
    const first = rows[0];
    if (!first) continue;
    if (rows.some((row) => !sameHeader(first, row))) {
      for (const row of rows) {
        invalid.push({
          rowIndex: row.rowIndex,
          errors: [
            "Rows grouped under the same order number must have identical customer, address and delivery fields",
          ],
        });
      }
      continue;
    }

    const itemMap = new Map<
      string,
      {
        productId: string;
        productVariantId: string | null;
        quantity: number;
        productName: string;
        productVariantName: string | null;
        serverUnitPrice: number;
      }
    >();
    for (const row of rows) {
      const itemKey = `${row.productId}:${row.productVariantId ?? "base"}`;
      const existing = itemMap.get(itemKey);
      itemMap.set(itemKey, {
        productId: row.productId,
        productVariantId: row.productVariantId,
        quantity: (existing?.quantity ?? 0) + row.quantity,
        productName: row.productName,
        productVariantName: row.productVariantName,
        serverUnitPrice: row.serverUnitPrice,
      });
      preview.push({
        rowIndex: row.rowIndex,
        groupKey,
        customerName: row.customerName,
        phone: row.phone,
        productName: row.productName,
        productVariantName: row.productVariantName,
        quantity: row.quantity,
        serverUnitPrice: row.serverUnitPrice,
        suppliedUnitPrice: row.suppliedUnitPrice,
        priceChanged:
          row.suppliedUnitPrice !== null &&
          row.suppliedUnitPrice !== row.serverUnitPrice,
      });
    }

    const items = [...itemMap.values()];
    groups.push({
      groupKey,
      sourceOrderId: stableSourceOrderId(input.fileHash, groupKey),
      rowIndices: rows.map((row) => row.rowIndex),
      customer: {
        name: first.customerName,
        phone: first.phone,
        wilaya: first.wilaya,
        commune: first.commune,
        address: first.address,
      },
      deliveryCost: first.deliveryCost,
      items: items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      })),
      previewItems: items.map((item) => ({
        productName: item.productName,
        productVariantName: item.productVariantName,
        quantity: item.quantity,
        serverUnitPrice: item.serverUnitPrice,
      })),
    });
  }

  return {
    source: input.source,
    fileHash: input.fileHash,
    sourceIdentity: `file:${input.fileHash}`,
    groups,
    preview: preview.sort((left, right) => left.rowIndex - right.rowIndex),
    invalid: invalid.sort((left, right) => left.rowIndex - right.rowIndex),
  };
}
