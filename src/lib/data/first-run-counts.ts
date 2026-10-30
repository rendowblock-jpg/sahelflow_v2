/**
 * Three cheap counts that tell whether a shop is brand new. A table the actor
 * may not read is reported as null (unknown) and never queried, so a limited
 * role never sees a first-run panel for data it cannot see.
 */
export interface FirstRunCounts {
  orders: number | null;
  products: number | null;
  customers: number | null;
}

interface LiveCountArgs {
  where: { deletedAt: null };
}

interface LiveCounter {
  count: (args: LiveCountArgs) => PromiseLike<number>;
}

export interface FirstRunPrisma {
  order: LiveCounter;
  product: LiveCounter;
  customer: LiveCounter;
}

export interface FirstRunAccess {
  orders: boolean;
  products: boolean;
  customers: boolean;
}

export async function getFirstRunCounts(
  prisma: FirstRunPrisma,
  access: FirstRunAccess,
): Promise<FirstRunCounts> {
  const args: LiveCountArgs = { where: { deletedAt: null } };
  const [orders, products, customers] = await Promise.all([
    access.orders ? prisma.order.count(args) : null,
    access.products ? prisma.product.count(args) : null,
    access.customers ? prisma.customer.count(args) : null,
  ]);
  return { orders, products, customers };
}
