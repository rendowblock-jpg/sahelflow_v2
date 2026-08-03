import "server-only";

import type { DbClient } from "@/lib/db";
import {
  AUTOMATION_TRIGGER_EFFECT_TYPE,
  automationHash,
  parseAutomationTriggerPayload,
  type AutomationTrigger,
} from "@/lib/automations/contracts";
import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandOutcome,
  BusinessCommandResult,
  OutboxIntentFact,
} from "@/lib/business-truth/contracts";
import {
  businessPrincipalFromTrustedActor,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import { recordOrderChangeInTx } from "@/lib/data/order-change-service";
import { orderService } from "@/lib/data/order-service";
import { nextOrderNumber } from "@/lib/data/service-base";
import { normalizePhone } from "@/lib/import/fields";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import {
  canonicalSourceOrderSourceMetadata,
  isCanonicalOrderAuthority,
} from "@/lib/orders/manual-order-authority";
import type { ShopContext } from "@/lib/shops/context";
import type { OrderStatus } from "@/types/domain";
import {
  ConflictError,
  NotFoundError,
  SahelFlowError,
  ValidationError,
} from "@/types/errors";
import { aiActionHash, parseSensitiveAiToolArgs } from "./contracts";
import {
  assertAiActionExecutionAuthority,
  type AiActionExecutionAuthority,
} from "./execution-authority";
import { buildAiActionTargetSnapshot } from "./targets";

export interface ApprovedAiActionExecutionInput {
  context: { prisma: DbClient; shop: ShopContext };
  authority: AiActionExecutionAuthority;
  proposalId: string;
  proposalDigest: string;
  executionKey: string;
  toolName: string;
  args: Record<string, unknown>;
  argsHash: string;
  targetBindingHash: string;
  requesterActorId: string;
  requesterSessionId: string;
  approver: TrustedActorContext;
}

export type ApprovedAiActionResult = BusinessCommandResult<Record<string, unknown>>;
type MutationOutcome = BusinessCommandOutcome<Record<string, unknown>>;

type LowStockProduct = Readonly<{
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  updatedAt?: Date;
}>;

const ORDER_TRIGGER_STATUSES = new Set([
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
]);

function serviceContext(
  tx: BusinessTransaction,
  shop: ShopContext,
): { prisma: DbClient; shop: ShopContext } {
  return { prisma: tx as unknown as DbClient, shop };
}

function automationScope(shop: ShopContext): readonly string[] {
  return [shop.workspaceId, shop.installationId, shop.shopId, shop.shopIncarnationId];
}

function automationIntent(
  shop: ShopContext,
  trigger: AutomationTrigger,
  triggerKey: string,
  occurredAt: Date,
  rawPayload: unknown,
): OutboxIntentFact {
  const payload = parseAutomationTriggerPayload(trigger, rawPayload);
  const effectKey = `automation-trigger:${automationHash([
    trigger,
    triggerKey,
    ...automationScope(shop),
  ])}`;
  return {
    effectKey,
    effectType: AUTOMATION_TRIGGER_EFFECT_TYPE,
    payload: {
      trigger,
      triggerKey,
      occurredAt: occurredAt.toISOString(),
      payload,
    },
  };
}

function orderStatusIntent(
  shop: ShopContext,
  order: {
    id: string;
    orderNumber: string;
    customerId: string;
    phone: string;
    totalPrice: number;
    wilaya: string;
    status: string;
    updatedAt: Date;
  },
): OutboxIntentFact | null {
  if (!ORDER_TRIGGER_STATUSES.has(order.status)) return null;
  const trigger = `order.${order.status}` as AutomationTrigger;
  return automationIntent(
    shop,
    trigger,
    `${trigger}:${order.id}:${order.updatedAt.toISOString()}`,
    order.updatedAt,
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerPhone: order.phone,
      totalPrice: order.totalPrice,
      wilaya: order.wilaya,
    },
  );
}

function lowStockIntent(
  shop: ShopContext,
  product: LowStockProduct,
): OutboxIntentFact {
  const occurredAt = product.updatedAt ?? new Date();
  return automationIntent(
    shop,
    "stock.low",
    product.updatedAt
      ? `stock.low:${product.id}:${product.updatedAt.toISOString()}`
      : `stock.low:${product.id}:${product.stock}:${product.lowStockThreshold}`,
    occurredAt,
    {
      productId: product.id,
      productName: product.name,
      stockLevel: product.stock,
      lowStockThreshold: product.lowStockThreshold,
    },
  );
}

async function assertExactTarget(
  tx: BusinessTransaction,
  shop: ShopContext,
  toolName: string,
  args: Record<string, unknown>,
  expectedHash: string,
): Promise<void> {
  const live = await buildAiActionTargetSnapshot(
    serviceContext(tx, shop),
    toolName,
    args,
  );
  if (aiActionHash(live.targetBinding) !== expectedHash) {
    throw new SahelFlowError(
      "The proposed business target changed before AI action execution",
      "AI_ACTION_TARGET_CONFLICT",
      409,
    );
  }
}

async function assertCatalogStockMutationAllowed(
  tx: BusinessTransaction,
  productId: string,
): Promise<void> {
  const activeReservations = await tx.$queryRaw<Array<{ present: number }>>`
    SELECT 1 AS "present"
    FROM "InventoryReservation"
    WHERE "productId" = ${productId}
      AND "state" = 'active'
    LIMIT 1
  `;
  if (activeReservations.length > 0) {
    throw new SahelFlowError(
      "Product stock is governed by an active inventory reservation",
      "CANONICAL_STOCK_ADJUSTMENT_REQUIRED",
      409,
    );
  }

  const pendingSelections = await tx.orderItem.findMany({
    where: {
      productId,
      order: { status: "pending", deletedAt: null },
    },
    select: {
      order: { select: { source: true, sourceMetadata: true } },
    },
  });
  if (
    pendingSelections.some(({ order }) =>
      isCanonicalOrderAuthority(order.source, order.sourceMetadata),
    )
  ) {
    throw new SahelFlowError(
      "Product stock is selected by a pending canonical order",
      "CANONICAL_CATALOG_MUTATION_BLOCKED",
      409,
    );
  }
}

function canonicalAlgerianPhone(value: string, field: string): string {
  const phone = normalizePhone(value);
  if (!/^0[5-7]\d{8}$/.test(phone)) {
    throw new ValidationError(
      "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
      field,
    );
  }
  return phone;
}

async function createOrder(
  tx: BusinessTransaction,
  shop: ShopContext,
  proposalId: string,
  proposalDigest: string,
  requesterSessionId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const customerId = String(args.customerId);
  const customer = await tx.customer.findFirst({
    where: { id: customerId, deletedAt: null },
  });
  if (!customer) throw new NotFoundError("Customer", customerId);

  const requestedItems = args.items as Array<{
    productId: string;
    productVariantId?: string;
    quantity: number;
  }>;
  const productIds = [...new Set(requestedItems.map((item) => item.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isActive: true, deletedAt: null },
    include: {
      productVariants: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  const items = requestedItems.map((item) => {
    const product = productById.get(item.productId);
    if (!product) throw new NotFoundError("Product", item.productId);
    const activeVariants = product.productVariants.filter(
      (variant) => variant.isActive,
    );
    if (product.productVariants.length > 0 && activeVariants.length === 0) {
      throw new ValidationError(
        `Product '${product.name}' has variants but none are active`,
        "items.productVariantId",
      );
    }
    if (activeVariants.length > 0) {
      const variant = item.productVariantId
        ? activeVariants.find((candidate) => candidate.id === item.productVariantId)
        : undefined;
      if (!variant) {
        throw new ValidationError(
          `Product '${product.name}' requires one exact active variant`,
          "items.productVariantId",
        );
      }
      return {
        productId: product.id,
        productVariantId: variant.id,
        productName: product.name,
        productVariantName: variant.name,
        quantity: item.quantity,
        unitPrice: variant.price ?? product.price,
      };
    }
    if (item.productVariantId) {
      throw new ValidationError(
        `Product '${product.name}' has no variants`,
        "items.productVariantId",
      );
    }
    return {
      productId: product.id,
      productVariantId: null,
      productName: product.name,
      productVariantName: null,
      quantity: item.quantity,
      unitPrice: product.price,
    };
  });

  const phone = canonicalAlgerianPhone(String(args.phone), "phone");
  const totalPrice = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const orderNumber = await nextOrderNumber(tx as unknown as DbClient, "ORD");
  const sourceMetadata = canonicalSourceOrderSourceMetadata({
    source: "ai_chat",
    sourceIdentity: requesterSessionId,
    sourceOrderId: proposalId,
    sourceRevision: proposalDigest,
    sourceDetails: { proposalId, proposalDigest },
  });
  const order = await tx.order.create({
    data: {
      orderNumber,
      status: "draft",
      version: 1,
      fulfillmentState: "unfulfilled",
      deliveryState: "not_created",
      inventoryState: "unreserved",
      codState: "not_expected",
      customerId,
      totalPrice,
      deliveryCost: 0,
      wilaya: String(args.wilaya),
      commune: String(args.commune),
      address: String(args.address),
      phone,
      source: "ai_chat",
      sourceOrderId: proposalId,
      sourceMetadata,
      notes: typeof args.notes === "string" ? args.notes : null,
      items: {
        create: items.map((item) => ({
          ...item,
          total: item.unitPrice * item.quantity,
        })),
      },
    },
    include: { items: true },
  });
  await recordOrderChangeInTx(tx, {
    orderId: order.id,
    actionType: "created",
    actor: "ai",
    payload: {
      authority: "proposal-bound-ai-v1",
      proposalId,
      itemCount: order.items.length,
      totalPrice,
    },
  });

  const createdIntent = automationIntent(
    shop,
    "order.created",
    `order.created:${order.id}`,
    order.createdAt,
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: customer.name,
      customerPhone: order.phone,
      totalPrice: order.totalPrice,
      wilaya: order.wilaya,
    },
  );

  return {
    result: {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.totalPrice,
      status: order.status,
    },
    audit: {
      action: "ai.order.created.v1",
      entity: "order",
      entityId: order.id,
      before: null,
      after: {
        status: order.status,
        totalPrice: order.totalPrice,
        itemCount: order.items.length,
      },
      metadata: { proposalId, authority: "proposal-bound-ai-v1" },
    },
    events: [
      {
        key: `ai-action:${proposalId}:order-created`,
        type: "order.source.created.v1",
        payload: {
          proposalId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          status: order.status,
          version: order.version,
          totalPrice: order.totalPrice,
          source: "ai_chat",
        },
      },
    ],
    outbox: [createdIntent],
    projectionInvalidations: [
      "orders:list",
      `orders:${order.id}`,
      "dashboard:orders",
      "customers:list",
      `customers:${customer.id}`,
    ],
  };
}

async function updateOrderStatus(
  tx: BusinessTransaction,
  shop: ShopContext,
  proposalId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const orderId = String(args.orderId);
  const status = String(args.status) as OrderStatus;
  if (status === "confirmed") {
    throw new SahelFlowError(
      "AI order confirmation requires the governed seller decision command",
      "CANONICAL_CONFIRMATION_REQUIRED",
      409,
    );
  }
  const before = await tx.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, orderNumber: true, status: true },
  });
  if (!before) throw new NotFoundError("Order", orderId);

  const effects = await orderService.updateStatusInTx(tx, orderId, status, {
    actor: "ai",
  });
  const outbox = [
    orderStatusIntent(shop, effects.order),
    ...effects.lowStockProducts.map((product) => lowStockIntent(shop, product)),
  ].filter((intent): intent is OutboxIntentFact => intent !== null);

  return {
    result: {
      id: effects.order.id,
      orderNumber: effects.order.orderNumber,
      status: effects.order.status,
    },
    audit: {
      action: "ai.order.status_updated.v1",
      entity: "order",
      entityId: effects.order.id,
      before: { status: before.status },
      after: { status: effects.order.status },
      metadata: { proposalId },
    },
    events: [
      {
        key: `ai-action:${proposalId}:order-status`,
        type: "order.status.changed.v1",
        payload: {
          proposalId,
          orderId: effects.order.id,
          orderNumber: effects.order.orderNumber,
          from: before.status,
          to: effects.order.status,
        },
      },
    ],
    outbox,
    projectionInvalidations: [
      "orders:list",
      `orders:${effects.order.id}`,
      "dashboard:orders",
      `customers:${effects.order.customerId}`,
    ],
  };
}

async function cancelOrder(
  tx: BusinessTransaction,
  shop: ShopContext,
  proposalId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const orderNumber = String(args.orderNumber);
  const order = await tx.order.findFirst({
    where: { orderNumber, deletedAt: null },
    select: { id: true, status: true, notes: true },
  });
  if (!order) throw new NotFoundError("Order", orderNumber);
  if (!["draft", "pending", "confirmed"].includes(order.status)) {
    throw new ConflictError(
      `Order '${orderNumber}' cannot be cancelled from '${order.status}'`,
    );
  }

  const reason = typeof args.reason === "string" ? args.reason : null;
  const cancellationNote = reason ? `[Annulée: ${reason}]` : "[Annulée]";
  await tx.order.update({
    where: { id: order.id },
    data: {
      notes: order.notes
        ? `${order.notes}\n${cancellationNote}`
        : cancellationNote,
    },
  });
  const effects = await orderService.updateStatusInTx(
    tx,
    order.id,
    "cancelled",
    { actor: "ai" },
  );
  const outbox = [
    orderStatusIntent(shop, effects.order),
    ...effects.lowStockProducts.map((product) => lowStockIntent(shop, product)),
  ].filter((intent): intent is OutboxIntentFact => intent !== null);

  return {
    result: {
      id: effects.order.id,
      orderNumber: effects.order.orderNumber,
      status: effects.order.status,
    },
    audit: {
      action: "ai.order.cancelled.v1",
      entity: "order",
      entityId: effects.order.id,
      before: { status: order.status },
      after: { status: effects.order.status },
      metadata: {
        proposalId,
        reasonProvided: reason !== null,
        reasonHash: reason ? aiActionHash(reason) : null,
      },
    },
    events: [
      {
        key: `ai-action:${proposalId}:order-cancelled`,
        type: "order.cancelled.v1",
        payload: {
          proposalId,
          orderId: effects.order.id,
          orderNumber: effects.order.orderNumber,
          from: order.status,
          to: effects.order.status,
          reasonHash: reason ? aiActionHash(reason) : null,
        },
      },
    ],
    outbox,
    projectionInvalidations: [
      "orders:list",
      `orders:${effects.order.id}`,
      "dashboard:orders",
      `customers:${effects.order.customerId}`,
    ],
  };
}

async function updateProductStock(
  tx: BusinessTransaction,
  shop: ShopContext,
  proposalId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const productId = String(args.productId);
  await assertCatalogStockMutationAllowed(tx, productId);
  const before = await tx.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      productVariants: {
        select: { id: true, name: true, stock: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!before) throw new NotFoundError("Product", productId);
  if (before.productVariants.length > 1) {
    throw new SahelFlowError(
      `Product '${before.name}' has multiple variants; use a variant-specific catalog action`,
      "AI_ACTION_VARIANT_SCOPE_REQUIRED",
      409,
    );
  }

  const newStock = Number(args.newStock);
  const variant = before.productVariants[0] ?? null;
  const product = await tx.product.update({
    where: { id: productId },
    data: { stock: newStock },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      lowStockThreshold: true,
      updatedAt: true,
    },
  });
  if (variant) {
    await tx.productVariant.update({
      where: { id: variant.id },
      data: { stock: newStock },
    });
  }
  const reason = typeof args.reason === "string" ? args.reason : null;
  const outbox =
    product.stock <= product.lowStockThreshold
      ? [lowStockIntent(shop, product)]
      : [];

  return {
    result: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock: product.stock,
      variantId: variant?.id ?? null,
    },
    audit: {
      action: "ai.product.stock_adjusted.v1",
      entity: "product",
      entityId: product.id,
      before: {
        stock: before.stock,
        variantStock: variant?.stock ?? null,
      },
      after: {
        stock: product.stock,
        variantStock: variant ? newStock : null,
      },
      metadata: {
        proposalId,
        variantId: variant?.id ?? null,
        reasonProvided: reason !== null,
        reasonHash: reason ? aiActionHash(reason) : null,
      },
    },
    events: [
      {
        key: `ai-action:${proposalId}:product-stock`,
        type: "product.stock.adjusted.v1",
        payload: {
          proposalId,
          productId: product.id,
          productVariantId: variant?.id ?? null,
          fromStock: before.stock,
          toStock: product.stock,
          reasonHash: reason ? aiActionHash(reason) : null,
        },
      },
    ],
    outbox,
    projectionInvalidations: [
      "products:list",
      `products:${product.id}`,
      "dashboard:products",
    ],
  };
}

async function createProduct(
  tx: BusinessTransaction,
  proposalId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const sku = typeof args.sku === "string" && args.sku ? args.sku : null;
  if (sku) {
    const existing = await tx.product.findFirst({
      where: { sku },
      select: { id: true, deletedAt: true },
    });
    if (existing) {
      throw new ConflictError(
        existing.deletedAt
          ? `A deleted product already owns SKU '${sku}' and must be restored first`
          : `Product with SKU '${sku}' already exists`,
      );
    }
  }
  const categoryId =
    typeof args.categoryId === "string" ? args.categoryId : null;
  if (categoryId) {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundError("Category", categoryId);
  }

  const product = await tx.product.create({
    data: {
      name: String(args.name),
      price: Number(args.price),
      sku,
      stock: Number(args.stock ?? 0),
      cost: args.cost === undefined ? null : Number(args.cost),
      categoryId,
      productVariants: {
        create: {
          name: "Default",
          sku,
          price: Number(args.price),
          stock: Number(args.stock ?? 0),
          isActive: true,
          sortOrder: 0,
        },
      },
    },
    select: { id: true, name: true, price: true, sku: true, stock: true },
  });

  return {
    result: product,
    audit: {
      action: "ai.product.created.v1",
      entity: "product",
      entityId: product.id,
      before: null,
      after: {
        price: product.price,
        stock: product.stock,
        skuPresent: product.sku !== null,
      },
      metadata: { proposalId },
    },
    events: [
      {
        key: `ai-action:${proposalId}:product-created`,
        type: "product.created.v1",
        payload: {
          proposalId,
          productId: product.id,
          price: product.price,
          stock: product.stock,
          sku: product.sku,
        },
      },
    ],
    projectionInvalidations: [
      "products:list",
      `products:${product.id}`,
      "dashboard:products",
    ],
  };
}

async function updateProductPrice(
  tx: BusinessTransaction,
  proposalId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const productId = String(args.productId);
  const before = await tx.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      id: true,
      name: true,
      price: true,
      sku: true,
      productVariants: {
        select: { id: true, name: true, price: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!before) throw new NotFoundError("Product", productId);
  if (before.productVariants.length > 1) {
    throw new SahelFlowError(
      `Product '${before.name}' has multiple variants; use a variant-specific catalog action`,
      "AI_ACTION_VARIANT_SCOPE_REQUIRED",
      409,
    );
  }

  const newPrice = Number(args.newPrice);
  const variant = before.productVariants[0] ?? null;
  const product = await tx.product.update({
    where: { id: productId },
    data: { price: newPrice },
    select: { id: true, name: true, price: true, sku: true },
  });
  if (variant) {
    await tx.productVariant.update({
      where: { id: variant.id },
      data: { price: newPrice },
    });
  }
  return {
    result: {
      ...product,
      variantId: variant?.id ?? null,
    },
    audit: {
      action: "ai.product.price_updated.v1",
      entity: "product",
      entityId: product.id,
      before: {
        price: before.price,
        variantPrice: variant?.price ?? null,
      },
      after: {
        price: product.price,
        variantPrice: variant ? newPrice : null,
      },
      metadata: { proposalId, variantId: variant?.id ?? null },
    },
    events: [
      {
        key: `ai-action:${proposalId}:product-price`,
        type: "product.price.updated.v1",
        payload: {
          proposalId,
          productId: product.id,
          productVariantId: variant?.id ?? null,
          fromPrice: before.price,
          toPrice: product.price,
        },
      },
    ],
    projectionInvalidations: [
      "products:list",
      `products:${product.id}`,
      "dashboard:products",
    ],
  };
}

async function createCustomer(
  tx: BusinessTransaction,
  proposalId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const phone = normalizePhone(String(args.phone));
  const phone2 =
    typeof args.phone2 === "string" && args.phone2
      ? normalizePhone(args.phone2)
      : null;
  const existing = await tx.customer.findFirst({
    where: { phone },
    select: { id: true, deletedAt: true },
  });
  if (existing) {
    throw new ConflictError(
      existing.deletedAt
        ? "A deleted customer already owns this phone and must be restored first"
        : "A customer already exists with this phone",
    );
  }
  const customer = await tx.customer.create({
    data: {
      name: String(args.name),
      phone,
      phone2,
      wilaya: typeof args.wilaya === "string" ? args.wilaya : null,
      commune: typeof args.commune === "string" ? args.commune : null,
      address: typeof args.address === "string" ? args.address : null,
      notes: typeof args.notes === "string" ? args.notes : null,
    },
    select: { id: true, name: true, phone: true, wilaya: true },
  });
  return {
    result: customer,
    audit: {
      action: "ai.customer.created.v1",
      entity: "customer",
      entityId: customer.id,
      before: null,
      after: { wilayaPresent: customer.wilaya !== null },
      metadata: { proposalId, phoneLast4: phone.slice(-4) },
    },
    events: [
      {
        key: `ai-action:${proposalId}:customer-created`,
        type: "customer.created.v1",
        payload: {
          proposalId,
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          wilaya: customer.wilaya,
        },
      },
    ],
    projectionInvalidations: [
      "customers:list",
      `customers:${customer.id}`,
      "dashboard:customers",
    ],
  };
}

async function updateCustomerNotes(
  tx: BusinessTransaction,
  proposalId: string,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  const customerId = String(args.customerId);
  const customer = await tx.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, notes: true },
  });
  if (!customer) throw new NotFoundError("Customer", customerId);
  const note = String(args.notes);
  const mode = String(args.mode ?? "append");
  const dated = `[${new Date().toISOString().slice(0, 10)}] ${note}`;
  const notes =
    mode === "replace"
      ? note
      : customer.notes
        ? `${customer.notes}\n${dated}`
        : dated;
  await tx.customer.update({
    where: { id: customerId },
    data: { notes },
  });
  return {
    result: {
      customerId,
      updated: true,
      mode,
      noteLength: note.length,
    },
    audit: {
      action: "ai.customer.notes_updated.v1",
      entity: "customer",
      entityId: customerId,
      before: { notesPresent: Boolean(customer.notes) },
      after: { notesPresent: true },
      metadata: {
        proposalId,
        mode,
        noteHash: aiActionHash(note),
        noteLength: note.length,
      },
    },
    events: [
      {
        key: `ai-action:${proposalId}:customer-notes`,
        type: "customer.notes.updated.v1",
        payload: {
          proposalId,
          customerId,
          mode,
          noteHash: aiActionHash(note),
          noteLength: note.length,
        },
      },
    ],
    projectionInvalidations: ["customers:list", `customers:${customerId}`],
  };
}

async function executeMutation(
  tx: BusinessTransaction,
  input: ApprovedAiActionExecutionInput,
  args: Record<string, unknown>,
): Promise<MutationOutcome> {
  await assertExactTarget(
    tx,
    input.context.shop,
    input.toolName,
    args,
    input.targetBindingHash,
  );

  switch (input.toolName) {
    case "create_order":
      return createOrder(
        tx,
        input.context.shop,
        input.proposalId,
        input.proposalDigest,
        input.requesterSessionId,
        args,
      );
    case "update_order_status":
      return updateOrderStatus(
        tx,
        input.context.shop,
        input.proposalId,
        args,
      );
    case "cancel_order":
      return cancelOrder(tx, input.context.shop, input.proposalId, args);
    case "update_product_stock":
      return updateProductStock(
        tx,
        input.context.shop,
        input.proposalId,
        args,
      );
    case "create_product":
      return createProduct(tx, input.proposalId, args);
    case "update_product_price":
      return updateProductPrice(tx, input.proposalId, args);
    case "create_customer":
      return createCustomer(tx, input.proposalId, args);
    case "update_customer_notes":
      return updateCustomerNotes(tx, input.proposalId, args);
    default:
      throw new SahelFlowError(
        `AI action '${input.toolName}' has no canonical executor`,
        "AI_ACTION_EXECUTOR_MISSING",
        503,
      );
  }
}

export async function executeApprovedAiAction(
  input: ApprovedAiActionExecutionInput,
): Promise<ApprovedAiActionResult> {
  const args = parseSensitiveAiToolArgs(input.toolName, input.args);
  const argsHash = aiActionHash(args);
  if (argsHash !== input.argsHash) {
    throw new SahelFlowError(
      "AI action arguments no longer match the persisted proposal",
      "AI_ACTION_ARGUMENT_TAMPERED",
      409,
    );
  }
  assertAiActionExecutionAuthority(input.authority, {
    toolName: input.toolName,
    argsHash,
  });
  if (
    input.authority.proposalId !== input.proposalId ||
    input.authority.proposalDigest !== input.proposalDigest ||
    input.authority.executionKey !== input.executionKey
  ) {
    throw new SahelFlowError(
      "AI action execution authority is bound to another proposal",
      "AI_ACTION_EXECUTION_AUTHORITY_MISMATCH",
      403,
    );
  }

  const principal = businessPrincipalFromTrustedActor(input.approver);
  const commandContext: BusinessPrincipalContext = {
    prisma: input.context.prisma,
    shop: input.context.shop,
    businessPrincipal: principal,
  };

  return executeBusinessCommand(
    commandContext,
    {
      idempotencyKey: `ai-action:${input.proposalId}`,
      commandType: "ai.action.execute.v1",
      aggregate: {
        type: "ai-action-proposal",
        id: input.proposalId,
        expectedVersion: 0,
      },
      actor: principal.auditActor,
      correlationId: input.executionKey,
      causationId: input.proposalDigest,
      payload: {
        proposalId: input.proposalId,
        proposalDigest: input.proposalDigest,
        executionKey: input.executionKey,
        toolName: input.toolName,
        argsHash,
        targetBindingHash: input.targetBindingHash,
        requesterActorId: input.requesterActorId,
      },
    },
    async ({ tx }) => {
      const mutation = await executeMutation(tx, input, args);
      return {
        ...mutation,
        audit: {
          ...mutation.audit,
          metadata: {
            ...(mutation.audit.metadata ?? {}),
            aiProposalId: input.proposalId,
            aiProposalDigestPrefix: input.proposalDigest.slice(0, 12),
            aiToolName: input.toolName,
            requesterActorId: input.requesterActorId,
            approver: principal.auditActor,
          },
        },
        events: [
          ...mutation.events,
          {
            key: `ai-action:${input.proposalId}:executed`,
            type: "ai.action.executed.v1",
            payload: {
              proposalId: input.proposalId,
              toolName: input.toolName,
              argsHash,
              targetBindingHash: input.targetBindingHash,
              requesterActorId: input.requesterActorId,
              approver: principal.auditActor,
            },
          },
        ],
      };
    },
  );
}
