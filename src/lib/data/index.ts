/**
 * Data layer — service barrel export.
 *
 * All services take a ServiceContext { prisma } so they work with
 * multi-shop (file-per-shop) PrismaClient instances.
 */
export { customerService } from "./customer-service";
export { productService } from "./product-service";
export { orderService } from "./order-service";
export { deliveryService } from "./delivery-service";
export { statsService } from "./stats-service";
export type { ServiceContext } from "./service-base";

// Extensions — search, stats, bulk operations
export { customerServiceExtensions } from "./extensions/customer-extensions";
export type { CustomerStats, CustomerListItem } from "./extensions/customer-extensions";
export { orderServiceExtensions } from "./extensions/order-extensions";
export type { BulkResult } from "./extensions/order-extensions";
export { productServiceExtensions } from "./extensions/product-extensions";
export type { ProductStats, ProductListItem } from "./extensions/product-extensions";
