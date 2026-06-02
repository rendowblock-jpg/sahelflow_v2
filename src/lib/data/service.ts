/**
 * SahelFlow Data Service — Barrel Re-export
 *
 * This file re-exports all decomposed service modules for backward compatibility.
 * All existing imports from '@/lib/data/service' continue to work unchanged.
 *
 * Individual services can also be imported directly for tree-shaking:
 *   import { getOrders } from "@/lib/data/order-service"
 *
 * Phase 64C: Decomposed from a single 725-line file into focused service modules.
 */

// Auth & Profile
export {
  getCurrentUser,
  getSellerProfile,
  updateSellerProfile,
  getActiveSellerId,
} from "./auth-service";

// Products & Categories
export {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
} from "./product-service";

// Orders
export {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  restoreOrder,
} from "./order-service";

// Customers
export {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  findOrCreateCustomer,
  getOrdersByCustomer,
} from "./customer-service";

// Automations
export {
  getAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
} from "./automation-service";

// Deliveries
export {
  getDeliveries,
  createDelivery,
  deleteDelivery,
} from "./delivery-service";

// Analytics & Agent Activity
export {
  getDashboardStats,
  getCODStats,
  getAnalyticsData,
  getAgentActivity,
  logAgentActivity,
} from "./analytics-service";

// Notifications
export {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  createNotification,
  deleteNotification,
} from "./notification-service";

// WhatsApp Templates
export {
  getWhatsAppTemplate,
  getWhatsAppTemplates,
  createWhatsAppTemplate,
  updateWhatsAppTemplate,
  deleteWhatsAppTemplate,
} from "./template-service";

// Shipping Rates
export {
  getSellerShippingRates,
  getShippingCostForWilaya,
} from "./shipping-service";

// Storage & Danger Zone
export {
  uploadProductImage,
  clearTestData,
} from "./storage-service";
