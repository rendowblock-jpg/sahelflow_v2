import "server-only";

import { createHash } from "node:crypto";

import { canonicalWilaya } from "@/lib/ai/extraction/geography";
import { dispatchTrigger, type TriggerEvent } from "@/lib/automations/engine";
import { sourceBusinessPrincipal } from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import type { ValidationFailure } from "@/lib/import/engine";
import { validateRows } from "@/lib/import/engine";
import { normalizePhone, parseNumber } from "@/lib/import/fields";
import { logger } from "@/lib/logger";
import {
  canonicalImportRowSchema,
  prepareCanonicalFileImport,
  type CanonicalImportRow,
  type PreparedCanonicalFileImport,
} from "@/lib/orders/canonical-file-import";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { readCanonicalSourceOrderAuthority } from "@/lib/orders/manual-order-authority";
import {
  pingBridge,
  readBridgeRows,
  writeBridgeStatuses,
  type BridgePing,
  type BridgeRow,
  type BridgeTarget,
} from "./bridge-client";
import {
  loadBridgeConfig,
  loadBridgeTarget,
  loadPushedStatuses,
  saveBridgeConfig,
  savePushedStatuses,
  type SheetFieldKey,
  type SheetSyncResult,
  type SheetsBridgeConfig,
} from "./bridge-config";

const SOURCE = "google_sheets" as const;
const PAGE_SIZE = 500;
const MAX_ROWS_PER_SYNC = 5_000;
const FULL_SCAN_EVERY_MS = 30 * 60 * 1000;
const PUSH_BATCH = 400;

// ── Column mapping ─────────────────────────────────────────────────────────

/** Header vocabulary for automatic mapping (folded: lower case, no accents). */
const FIELD_ALIASES: Record<SheetFieldKey, readonly string[]> = {
  orderNumber: ["order id", "order number", "order no", "numero de commande", "n commande", "id commande", "reference", "ref", "رقم الطلب", "رقم الطلبية"],
  customerName: ["full name", "nom complet", "nom et prenom", "customer name", "nom du client", "customer", "client", "name", "nom", "الاسم الكامل", "اسم الزبون", "اسم العميل", "الاسم", "الزبون"],
  phone: ["phone number", "numero de telephone", "telephone", "phone", "mobile", "tel", "gsm", "رقم الهاتف", "الهاتف", "الجوال", "النقال"],
  wilaya: ["wilaya", "state", "province", "region", "الولاية", "ولاية"],
  commune: ["commune", "city", "ville", "daira", "البلدية", "بلدية", "المدينة"],
  address: ["address", "adresse", "العنوان"],
  productName: ["product name", "nom du produit", "product", "produit", "article", "item", "المنتج", "منتج", "السلعة"],
  productSku: ["sku", "product sku", "reference produit"],
  variantName: ["variant", "variante", "option", "taille", "size", "couleur", "color", "المقاس", "اللون"],
  quantity: ["quantity", "quantite", "qty", "qte", "الكمية", "العدد"],
  deliveryCost: ["shipping cost", "frais de livraison", "delivery price", "shipping", "سعر التوصيل", "ثمن التوصيل"],
  notes: ["notes", "note", "remarque", "commentaire", "comment", "ملاحظة", "ملاحظات"],
};

/** Order in which "contains" matches are tried: specific fields before broad ones. */
const CONTAINS_PRIORITY: readonly SheetFieldKey[] = [
  "phone",
  "customerName",
  "wilaya",
  "commune",
  "address",
  "productSku",
  "productName",
  "variantName",
  "quantity",
  "deliveryCost",
  "notes",
  "orderNumber",
];

export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_\-:.°#/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-guess header → field mapping; each header and each field used once. */
export function autoMapSheetHeaders(headers: readonly string[]): Record<string, SheetFieldKey> {
  const mapping: Record<string, SheetFieldKey> = {};
  const usedFields = new Set<SheetFieldKey>();
  const folded = headers.map((header) => foldText(header));
  const assign = (index: number, field: SheetFieldKey) => {
    const header = headers[index];
    if (header === undefined || mapping[header] || usedFields.has(field)) return;
    mapping[header] = field;
    usedFields.add(field);
  };
  for (const field of CONTAINS_PRIORITY) {
    const aliases = FIELD_ALIASES[field].map(foldText);
    const index = folded.findIndex(
      (header, i) => !mapping[headers[i] ?? ""] && aliases.includes(header),
    );
    if (index >= 0) assign(index, field);
  }
  for (const field of CONTAINS_PRIORITY) {
    if (usedFields.has(field)) continue;
    const aliases = FIELD_ALIASES[field].map(foldText).filter((alias) => alias.length >= 3);
    const index = folded.findIndex(
      (header, i) =>
        !mapping[headers[i] ?? ""] &&
        aliases.some((alias) => new RegExp(`(^| )${escapeRegExp(alias)}( |$)`, "u").test(header)),
    );
    if (index >= 0) assign(index, field);
  }
  return mapping;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Algerian mobile in national form; sheets often drop the leading zero. */
export function sheetPhone(raw: string): string {
  const digits = normalizePhone(raw);
  return /^[5-7]\d{8}$/.test(digits) ? `0${digits}` : digits;
}

interface SheetImportRow {
  rowIndex: number;
  id: string;
  notes: string | undefined;
  data: Partial<CanonicalImportRow>;
}

function rowData(
  row: BridgeRow,
  config: Pick<SheetsBridgeConfig, "mapping" | "productAliases">,
): SheetImportRow {
  const value: Partial<Record<SheetFieldKey, string>> = {};
  for (const [header, field] of Object.entries(config.mapping)) {
    const cell = row.cells[header];
    if (cell !== undefined && cell.trim()) value[field] = cell.trim();
  }
  const productText = value.productName ?? "";
  const alias = productText ? config.productAliases[foldText(productText)] : undefined;
  const quantity = value.quantity ? parseNumber(value.quantity) : 1;
  const delivery = value.deliveryCost ? parseNumber(value.deliveryCost) : 0;
  return {
    rowIndex: row.row,
    id: row.id,
    notes: value.notes,
    data: {
      orderNumber: value.orderNumber || row.id,
      customerName: value.customerName ?? "",
      phone: value.phone ? sheetPhone(value.phone) : "",
      wilaya: value.wilaya ? canonicalWilaya(value.wilaya) ?? value.wilaya : "",
      commune: value.commune,
      address: value.address,
      productName: alias ?? (productText || undefined),
      productSku: value.productSku,
      variantName: value.variantName,
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : Number.NaN,
      deliveryCost: Number.isFinite(delivery) && delivery >= 0 ? Math.round(delivery) : 0,
    },
  };
}

// ── Reading and preparing ──────────────────────────────────────────────────

export function sheetSourceIdentity(config: Pick<SheetsBridgeConfig, "spreadsheetId" | "sheet">): string {
  return `sheet:${config.spreadsheetId ?? "unknown"}:${config.sheet ?? ""}`.slice(0, 200);
}

function sheetSourceOrderId(identity: string, groupKey: string): string {
  const digest = createHash("sha256").update(`${identity}\u001f${groupKey}`).digest("hex");
  return `gs-${digest.slice(0, 40)}`;
}

async function readRows(
  target: BridgeTarget,
  sheet: string | undefined,
  fromRow: number,
  maxRows: number,
): Promise<{ rows: BridgeRow[]; nextRow: number }> {
  const rows: BridgeRow[] = [];
  let cursor = fromRow;
  for (;;) {
    const page = await readBridgeRows(target, { sheet, fromRow: cursor, limit: PAGE_SIZE });
    rows.push(...page.rows);
    cursor = page.nextRow;
    if (cursor > page.lastRow || rows.length >= maxRows) break;
  }
  return { rows, nextRow: cursor };
}

export interface PreparedSheetImport {
  prepared: PreparedCanonicalFileImport;
  rowIds: Map<number, string>;
  notesByGroup: Map<string, string>;
  rowsByGroup: Map<string, string[]>;
}

export async function prepareSheetImport(
  context: ServiceContext,
  config: SheetsBridgeConfig,
  rows: BridgeRow[],
): Promise<PreparedSheetImport> {
  const mapped = rows.map((row) => rowData(row, config));
  const structural = validateRows(
    mapped.map((row) => ({ rowIndex: row.rowIndex, data: row.data })),
    canonicalImportRowSchema,
  );
  const identity = sheetSourceIdentity(config);
  const prepared = await prepareCanonicalFileImport(context, {
    source: SOURCE,
    fileHash: createHash("sha256").update(identity).digest("hex"),
    rows: structural.valid,
    structuralInvalid: structural.invalid,
    sourceIdentity: identity,
    sourceOrderIdFor: (groupKey) => sheetSourceOrderId(identity, groupKey),
  });
  const rowIds = new Map(mapped.map((row) => [row.rowIndex, row.id]));
  const notesByGroup = new Map<string, string>();
  const rowsByGroup = new Map<string, string[]>();
  for (const row of mapped) {
    const groupKey = row.data.orderNumber ?? row.id;
    if (row.notes && !notesByGroup.has(groupKey)) notesByGroup.set(groupKey, row.notes);
    rowsByGroup.set(groupKey, [...(rowsByGroup.get(groupKey) ?? []), row.id]);
  }
  return { prepared, rowIds, notesByGroup, rowsByGroup };
}

// ── Friendly row errors ────────────────────────────────────────────────────

export type SheetRowProblem =
  | "product"
  | "ambiguousProduct"
  | "variant"
  | "phone"
  | "name"
  | "wilaya"
  | "quantity"
  | "grouping"
  | "other";

export function classifyRowError(errors: readonly string[]): SheetRowProblem {
  const text = errors.join(" ").toLowerCase();
  if (text.includes("ambiguous")) return "ambiguousProduct";
  if (text.includes("variant")) return "variant";
  if (text.includes("catalog product") || text.includes("productsku")) return "product";
  if (text.includes("phone")) return "phone";
  if (text.includes("customername")) return "name";
  if (text.includes("wilaya")) return "wilaya";
  if (text.includes("quantity")) return "quantity";
  if (text.includes("grouped under the same order")) return "grouping";
  return "other";
}

const STATUS_LABELS: Record<SheetsBridgeConfig["statusLanguage"], Record<string, string>> = {
  ar: {
    draft: "مسودة",
    pending: "في انتظار التأكيد",
    confirmed: "مؤكدة",
    shipped: "تم الشحن",
    delivered: "تم التسليم",
    returned: "مرتجعة",
    refused: "مرفوضة",
    cancelled: "ملغاة",
  },
  fr: {
    draft: "Brouillon",
    pending: "En attente de confirmation",
    confirmed: "Confirmée",
    shipped: "Expédiée",
    delivered: "Livrée",
    returned: "Retournée",
    refused: "Refusée",
    cancelled: "Annulée",
  },
  en: {
    draft: "Draft",
    pending: "Awaiting confirmation",
    confirmed: "Confirmed",
    shipped: "Shipped",
    delivered: "Delivered",
    returned: "Returned",
    refused: "Refused",
    cancelled: "Cancelled",
  },
};

const PROBLEM_LABELS: Record<SheetsBridgeConfig["statusLanguage"], Record<SheetRowProblem, string>> = {
  ar: {
    product: "المنتج غير موجود في SahelFlow",
    ambiguousProduct: "اسم المنتج يطابق أكثر من منتج",
    variant: "الخيار (المقاس/اللون) غير معروف",
    phone: "رقم الهاتف غير صالح",
    name: "اسم الزبون ناقص",
    wilaya: "الولاية ناقصة",
    quantity: "الكمية غير صالحة",
    grouping: "أسطر نفس الطلب غير متطابقة",
    other: "راجع هذا السطر",
  },
  fr: {
    product: "Produit introuvable dans SahelFlow",
    ambiguousProduct: "Le nom correspond à plusieurs produits",
    variant: "Variante (taille/couleur) inconnue",
    phone: "Téléphone invalide",
    name: "Nom du client manquant",
    wilaya: "Wilaya manquante",
    quantity: "Quantité invalide",
    grouping: "Lignes d'une même commande incohérentes",
    other: "Vérifiez cette ligne",
  },
  en: {
    product: "Product not found in SahelFlow",
    ambiguousProduct: "Name matches several products",
    variant: "Unknown variant (size/colour)",
    phone: "Invalid phone number",
    name: "Customer name missing",
    wilaya: "Wilaya missing",
    quantity: "Invalid quantity",
    grouping: "Rows of one order disagree",
    other: "Check this row",
  },
};

const NOT_IMPORTED: Record<SheetsBridgeConfig["statusLanguage"], string> = {
  ar: "⚠ لم تُستورد",
  fr: "⚠ Non importée",
  en: "⚠ Not imported",
};

export function sheetStatusLabel(language: SheetsBridgeConfig["statusLanguage"], status: string): string {
  return STATUS_LABELS[language][status] ?? status;
}

export function sheetProblemLabel(
  language: SheetsBridgeConfig["statusLanguage"],
  problem: SheetRowProblem,
): string {
  return `${NOT_IMPORTED[language]}: ${PROBLEM_LABELS[language][problem]}`;
}

// ── Preview ────────────────────────────────────────────────────────────────

export interface SheetPreview {
  ping: BridgePing;
  mapping: Record<string, SheetFieldKey>;
  rowsRead: number;
  orders: number;
  alreadyImported: number;
  preview: Array<{
    row: number;
    customerName: string;
    phone: string;
    wilaya: string;
    product: string;
    quantity: number;
    alreadyImported: boolean;
  }>;
  problems: Array<{ row: number; problem: SheetRowProblem; detail: string }>;
  unmatchedProducts: string[];
  catalogProducts: string[];
}

export async function previewSheetImport(
  context: ServiceContext,
  options: {
    sheet?: string;
    mapping?: Record<string, SheetFieldKey>;
    productAliases?: Record<string, string>;
  } = {},
): Promise<SheetPreview> {
  const target = await loadBridgeTarget(context);
  if (!target) throw new Error("Google Sheets is not connected");
  const stored = await loadBridgeConfig(context);
  const sheet = options.sheet ?? stored.sheet ?? undefined;
  const ping = await pingBridge(target, { sheet });
  const sameSheet = stored.sheet === ping.sheet && stored.spreadsheetId === ping.spreadsheetId;
  const mapping =
    options.mapping ??
    (sameSheet && Object.keys(stored.mapping).length > 0
      ? stored.mapping
      : autoMapSheetHeaders(ping.headers));
  const config: SheetsBridgeConfig = {
    ...stored,
    spreadsheetId: ping.spreadsheetId,
    sheet: ping.sheet,
    mapping,
    productAliases: options.productAliases ?? stored.productAliases,
  };
  const { rows } = await readRows(target, ping.sheet, 2, 200);
  const { prepared } = await prepareSheetImport(context, config, rows);
  const existing = await existingSourceOrderIds(
    context,
    prepared.groups.map((group) => group.sourceOrderId),
  );
  const alreadyByRow = new Set<number>();
  for (const group of prepared.groups) {
    if (existing.has(group.sourceOrderId)) {
      for (const index of group.rowIndices) alreadyByRow.add(index);
    }
  }
  const productTexts = new Map(
    rows.map((row) => {
      const header = Object.entries(mapping).find(([, field]) => field === "productName")?.[0];
      return [row.row, header ? (row.cells[header] ?? "").trim() : ""];
    }),
  );
  const problems = prepared.invalid.slice(0, 100).map((failure: ValidationFailure) => ({
    row: failure.rowIndex,
    problem: classifyRowError(failure.errors),
    detail: failure.errors.join("; ").slice(0, 300),
  }));
  const unmatched = new Set<string>();
  for (const problem of problems) {
    if (problem.problem === "product") {
      const text = productTexts.get(problem.row);
      if (text) unmatched.add(text);
    }
  }
  const catalog = await context.prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 1_000,
  });
  return {
    ping,
    mapping,
    rowsRead: rows.length,
    orders: prepared.groups.length,
    alreadyImported: prepared.groups.filter((group) => existing.has(group.sourceOrderId)).length,
    preview: prepared.preview.slice(0, 15).map((row) => ({
      row: row.rowIndex,
      customerName: row.customerName,
      phone: row.phone,
      wilaya:
        prepared.groups.find((group) => group.groupKey === row.groupKey)?.customer.wilaya ?? "",
      product: row.productVariantName ? `${row.productName} · ${row.productVariantName}` : row.productName,
      quantity: row.quantity,
      alreadyImported: alreadyByRow.has(row.rowIndex),
    })),
    problems,
    unmatchedProducts: [...unmatched].slice(0, 50),
    catalogProducts: catalog.map((product) => product.name),
  };
}

async function existingSourceOrderIds(
  context: ServiceContext,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const found = new Set<string>();
  for (let start = 0; start < ids.length; start += 500) {
    const rows = await context.prisma.order.findMany({
      where: { source: SOURCE, sourceOrderId: { in: ids.slice(start, start + 500) } },
      select: { sourceOrderId: true },
    });
    for (const row of rows) if (row.sourceOrderId) found.add(row.sourceOrderId);
  }
  return found;
}

// ── Sync ───────────────────────────────────────────────────────────────────

let syncInFlight: Promise<SheetSyncResult> | null = null;

/** One sync at a time per process; a second caller joins the running one. */
export function runSheetSync(
  context: ServiceContext,
  options: { full?: boolean; importRows?: boolean; now?: Date } = {},
): Promise<SheetSyncResult> {
  if (!syncInFlight) {
    syncInFlight = syncOnce(context, options).finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
}

async function syncOnce(
  context: ServiceContext,
  options: { full?: boolean; importRows?: boolean; now?: Date },
): Promise<SheetSyncResult> {
  const now = options.now ?? new Date();
  const config = await loadBridgeConfig(context);
  const target = await loadBridgeTarget(context);
  const result: SheetSyncResult = {
    at: now.toISOString(),
    imported: 0,
    alreadyImported: 0,
    failed: 0,
    pushed: 0,
    errors: [],
    problem: null,
  };
  if (!target || !config.spreadsheetId || !config.sheet) {
    result.problem = "NOT_CONNECTED";
    return result;
  }

  const full =
    options.full ||
    !config.lastFullScanAt ||
    now.getTime() - Date.parse(config.lastFullScanAt) > FULL_SCAN_EVERY_MS;
  let problemsForSheet: Array<{ id: string; problem: SheetRowProblem }> = [];
  let nextConfig: SheetsBridgeConfig = { ...config };

  if (options.importRows !== false) {
    try {
      const { rows, nextRow } = await readRows(
        target,
        config.sheet,
        full ? 2 : config.cursorRow,
        MAX_ROWS_PER_SYNC,
      );
      const { prepared, rowIds, notesByGroup, rowsByGroup } = await prepareSheetImport(
        context,
        config,
        rows,
      );
      const existing = await existingSourceOrderIds(
        context,
        prepared.groups.map((group) => group.sourceOrderId),
      );
      const identity = prepared.sourceIdentity;
      const commandContext = {
        ...context,
        businessPrincipal: sourceBusinessPrincipal(SOURCE, identity),
      };
      for (const group of prepared.groups) {
        if (existing.has(group.sourceOrderId)) {
          result.alreadyImported += 1;
          continue;
        }
        try {
          const sheetRowIds = rowsByGroup.get(group.groupKey) ?? [];
          const firstRow = group.rowIndices[0] ?? 0;
          const notes = notesByGroup.get(group.groupKey);
          const command = await createCanonicalSourceOrder(commandContext, {
            idempotencyKey: `sheets:${group.sourceOrderId}`,
            correlationId: `sheets:${group.sourceOrderId}`,
            source: SOURCE,
            sourceIdentity: identity,
            sourceOrderId: group.sourceOrderId,
            sourceDetails: {
              spreadsheetId: config.spreadsheetId,
              sheet: config.sheet,
              sheetRowIds,
            },
            newCustomer: group.customer,
            items: group.items,
            wilaya: group.customer.wilaya,
            commune: group.customer.commune || group.customer.wilaya,
            address: group.customer.address || group.customer.commune || group.customer.wilaya,
            phone: group.customer.phone,
            deliveryCost: group.deliveryCost,
            notes: [
              `Google Sheets "${config.spreadsheetName ?? ""}" › ${config.sheet} › row ${firstRow}`,
              notes ? `Note: ${notes}` : "",
            ]
              .filter(Boolean)
              .join("\n")
              .slice(0, 2000),
          });
          if (command.replayed) {
            result.alreadyImported += 1;
          } else {
            result.imported += 1;
            await dispatchTrigger(
              context,
              "order.created" as TriggerEvent,
              command.result.automation,
              {
                triggerKey: `order.created:${command.result.order.id}`,
                occurredAt: command.result.order.createdAt,
              },
            );
          }
        } catch (error) {
          result.failed += 1;
          const row = group.rowIndices[0] ?? 0;
          const message = error instanceof Error ? error.message : "Order could not be created";
          logger.warn("integrations.google_sheets.row_failed", { row, code: "ORDER_CREATE_FAILED" });
          if (result.errors.length < 25) result.errors.push({ row, message: message.slice(0, 300) });
          const id = rowIds.get(row);
          if (id) problemsForSheet.push({ id, problem: classifyRowError([message]) });
        }
      }
      for (const failure of prepared.invalid) {
        result.failed += 1;
        if (result.errors.length < 25) {
          result.errors.push({ row: failure.rowIndex, message: failure.errors.join("; ").slice(0, 300) });
        }
        const id = rowIds.get(failure.rowIndex);
        if (id) problemsForSheet.push({ id, problem: classifyRowError(failure.errors) });
      }
      nextConfig = {
        ...nextConfig,
        cursorRow: Math.max(2, nextRow),
        ...(full ? { lastFullScanAt: now.toISOString() } : {}),
      };
    } catch (error) {
      result.problem = error instanceof Error ? error.message.slice(0, 300) : "Sync failed";
      problemsForSheet = [];
    }
  }

  if (config.writeBack && !result.problem) {
    try {
      result.pushed = await pushSheetStatuses(context, config, target, problemsForSheet);
    } catch (error) {
      result.problem = error instanceof Error ? error.message.slice(0, 300) : "Status write-back failed";
    }
  }

  await saveBridgeConfig(context, {
    ...nextConfig,
    lastSyncAt: now.toISOString(),
    lastResult: result,
  });
  return result;
}

/**
 * Write each imported order's current status, order number and tracking into
 * its sheet rows, and a plain reason into rows that could not be imported.
 * Only changed values are sent; the last value written per row is remembered.
 */
export async function pushSheetStatuses(
  context: ServiceContext,
  config: SheetsBridgeConfig,
  target: BridgeTarget,
  problems: Array<{ id: string; problem: SheetRowProblem }>,
): Promise<number> {
  const pushed = await loadPushedStatuses(context);
  const desired = new Map<string, { status: string; order: string; tracking: string }>();
  for (const { id, problem } of problems) {
    desired.set(id, { status: sheetProblemLabel(config.statusLanguage, problem), order: "", tracking: "" });
  }
  const orders = await context.prisma.order.findMany({
    where: { source: SOURCE, deletedAt: null },
    select: {
      orderNumber: true,
      status: true,
      source: true,
      sourceMetadata: true,
      delivery: { select: { trackingNumber: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 5_000,
  });
  for (const order of orders) {
    const authority = readCanonicalSourceOrderAuthority(order.source, order.sourceMetadata);
    const details = authority?.sourceDetails;
    if (!details || details.spreadsheetId !== config.spreadsheetId || details.sheet !== config.sheet) continue;
    const ids = Array.isArray(details.sheetRowIds) ? details.sheetRowIds : [];
    for (const id of ids) {
      if (typeof id !== "string") continue;
      desired.set(id, {
        status: sheetStatusLabel(config.statusLanguage, order.status),
        order: order.orderNumber,
        tracking: order.delivery?.trackingNumber ?? "",
      });
    }
  }

  const changes = [...desired.entries()]
    .filter(([id, value]) => pushed[id] !== signature(value))
    .map(([id, value]) => ({ id, ...value }));
  let written = 0;
  for (let start = 0; start < changes.length; start += PUSH_BATCH) {
    const batch = changes.slice(start, start + PUSH_BATCH);
    const response = await writeBridgeStatuses(target, { sheet: config.sheet ?? undefined, updates: batch });
    const missing = new Set(response.missing);
    for (const change of batch) {
      if (missing.has(change.id)) continue;
      pushed[change.id] = signature(change);
      written += 1;
    }
  }
  // Remember only rows that still exist in this sheet's desired state.
  const kept = Object.fromEntries(Object.entries(pushed).filter(([id]) => desired.has(id)));
  await savePushedStatuses(context, kept);
  return written;
}

function signature(value: { status: string; order: string; tracking: string }): string {
  return `${value.status}\u001f${value.order}\u001f${value.tracking}`;
}
