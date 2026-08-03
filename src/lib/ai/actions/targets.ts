import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { normalizePhone } from "@/lib/import/fields";
import { SahelFlowError } from "@/types/errors";

export interface AiActionTargetSnapshot {
  targetBinding: Record<string, unknown>;
  summary: Record<string, unknown>;
}

function missing(entity: string, identity: string): never {
  throw new SahelFlowError(
    `${entity} '${identity}' is unavailable for this AI proposal`,
    "AI_ACTION_TARGET_NOT_FOUND",
    409,
  );
}

export async function buildAiActionTargetSnapshot(
  context: ServiceContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<AiActionTargetSnapshot> {
  const db = context.prisma;

  switch (toolName) {
    case "create_order": {
      const customerId = String(args.customerId);
      const customer = await db.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, name: true, updatedAt: true },
      });
      if (!customer) return missing("Customer", customerId);

      const items = args.items as Array<{
        productId: string;
        productVariantId?: string;
        quantity: number;
      }>;
      const productIds = [...new Set(items.map((item) => item.productId))];
      const products = await db.product.findMany({
        where: { id: { in: productIds }, deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          updatedAt: true,
          productVariants: {
            select: {
              id: true,
              price: true,
              stock: true,
              isActive: true,
              updatedAt: true,
            },
          },
        },
      });
      if (products.length !== productIds.length) {
        return missing("Product selection", productIds.join(","));
      }
      const productMap = new Map(products.map((product) => [product.id, product]));
      const selected = items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) return missing("Product", item.productId);
        const variant = item.productVariantId
          ? product.productVariants.find(
              (candidate) => candidate.id === item.productVariantId,
            )
          : null;
        if (item.productVariantId && (!variant || !variant.isActive)) {
          return missing("Product variant", item.productVariantId);
        }
        return {
          productId: product.id,
          productName: product.name,
          productPrice: product.price,
          productStock: product.stock,
          productUpdatedAt: product.updatedAt.toISOString(),
          productVariantId: variant?.id ?? null,
          variantPrice: variant?.price ?? null,
          variantStock: variant?.stock ?? null,
          variantUpdatedAt: variant?.updatedAt.toISOString() ?? null,
          quantity: item.quantity,
        };
      });
      return {
        targetBinding: {
          customer: {
            id: customer.id,
            updatedAt: customer.updatedAt.toISOString(),
          },
          items: selected,
        },
        summary: {
          customerName: customer.name,
          itemCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
          wilaya: args.wilaya,
        },
      };
    }

    case "update_order_status": {
      const orderId = String(args.orderId);
      const order = await db.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          version: true,
          updatedAt: true,
        },
      });
      if (!order) return missing("Order", orderId);
      return {
        targetBinding: {
          id: order.id,
          status: order.status,
          version: order.version,
          updatedAt: order.updatedAt.toISOString(),
        },
        summary: {
          orderNumber: order.orderNumber,
          fromStatus: order.status,
          toStatus: args.status,
        },
      };
    }

    case "cancel_order": {
      const orderNumber = String(args.orderNumber);
      const order = await db.order.findFirst({
        where: { orderNumber, deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          version: true,
          updatedAt: true,
        },
      });
      if (!order) return missing("Order", orderNumber);
      return {
        targetBinding: {
          id: order.id,
          status: order.status,
          version: order.version,
          updatedAt: order.updatedAt.toISOString(),
        },
        summary: {
          orderNumber: order.orderNumber,
          fromStatus: order.status,
          toStatus: "cancelled",
          reasonProvided: Boolean(args.reason),
        },
      };
    }

    case "update_product_stock": {
      const productId = String(args.productId);
      const product = await db.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: {
          id: true,
          name: true,
          stock: true,
          updatedAt: true,
        },
      });
      if (!product) return missing("Product", productId);
      return {
        targetBinding: {
          id: product.id,
          stock: product.stock,
          updatedAt: product.updatedAt.toISOString(),
        },
        summary: {
          productName: product.name,
          fromStock: product.stock,
          toStock: args.newStock,
          reasonProvided: Boolean(args.reason),
        },
      };
    }

    case "update_product_price": {
      const productId = String(args.productId);
      const product = await db.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: {
          id: true,
          name: true,
          price: true,
          updatedAt: true,
        },
      });
      if (!product) return missing("Product", productId);
      return {
        targetBinding: {
          id: product.id,
          price: product.price,
          updatedAt: product.updatedAt.toISOString(),
        },
        summary: {
          productName: product.name,
          fromPrice: product.price,
          toPrice: args.newPrice,
        },
      };
    }

    case "create_product": {
      const sku = typeof args.sku === "string" && args.sku ? args.sku : null;
      const existing = sku
        ? await db.product.findFirst({
            where: { sku },
            select: { id: true, deletedAt: true, updatedAt: true },
          })
        : null;
      const categoryId =
        typeof args.categoryId === "string" ? args.categoryId : null;
      const category = categoryId
        ? await db.category.findUnique({
            where: { id: categoryId },
            select: { id: true, name: true, updatedAt: true },
          })
        : null;
      if (categoryId && !category) return missing("Category", categoryId);
      return {
        targetBinding: {
          sku,
          existingSkuOwner: existing
            ? {
                id: existing.id,
                deletedAt: existing.deletedAt?.toISOString() ?? null,
                updatedAt: existing.updatedAt.toISOString(),
              }
            : null,
          category: category
            ? {
                id: category.id,
                updatedAt: category.updatedAt.toISOString(),
              }
            : null,
        },
        summary: {
          productName: args.name,
          price: args.price,
          stock: args.stock,
          sku,
          categoryName: category?.name ?? null,
        },
      };
    }

    case "create_customer": {
      const phone = normalizePhone(String(args.phone));
      const existing = await db.customer.findFirst({
        where: { phone },
        select: { id: true, deletedAt: true, updatedAt: true },
      });
      return {
        targetBinding: {
          normalizedPhone: phone,
          existingPhoneOwner: existing
            ? {
                id: existing.id,
                deletedAt: existing.deletedAt?.toISOString() ?? null,
                updatedAt: existing.updatedAt.toISOString(),
              }
            : null,
        },
        summary: {
          customerName: args.name,
          phoneLast4: phone.slice(-4),
          wilaya: args.wilaya ?? null,
        },
      };
    }

    case "update_customer_notes": {
      const customerId = String(args.customerId);
      const customer = await db.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, name: true, updatedAt: true },
      });
      if (!customer) return missing("Customer", customerId);
      return {
        targetBinding: {
          id: customer.id,
          updatedAt: customer.updatedAt.toISOString(),
        },
        summary: {
          customerName: customer.name,
          mode: args.mode,
          noteLength: String(args.notes).length,
        },
      };
    }

    default:
      throw new SahelFlowError(
        `AI action target binding is unavailable for '${toolName}'`,
        "AI_ACTION_TARGET_BINDING_UNAVAILABLE",
        409,
      );
  }
}
