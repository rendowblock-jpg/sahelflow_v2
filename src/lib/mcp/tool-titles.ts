/**
 * Tool titles — human-readable names shown in client UIs.
 * CodFlow convention: pure presentation; one entry per registered tool.
 * Coverage enforced by tests against `getAllRegisteredToolNames()`.
 */

export const TOOL_TITLES: Record<string, string> = {
  // Orders
  searchOrders: "Search orders",
  getOrderDetails: "Get order details",
  listRecentOrders: "List recent orders",
  createOrder: "Create order",
  updateOrderStatus: "Update order status",
  cancelOrder: "Cancel order",
  // Customers
  searchCustomers: "Search customers",
  getCustomerDetails: "Get customer details",
  getCustomerOrders: "Get customer orders",
  createCustomer: "Create customer",
  updateCustomerNotes: "Update customer notes",
  // Products
  searchProducts: "Search products",
  getProductDetails: "Get product details",
  getLowStockProducts: "Get low stock products",
  getTopProducts: "Get top products",
  createProduct: "Create product",
  updateProductPrice: "Update product price",
  updateProductStock: "Update product stock",
  // Delivery
  estimateDeliveryCost: "Estimate delivery cost",
  getDeliveryCostComparison: "Compare delivery costs",
  getDeliveryStatus: "Get delivery status",
  getPendingDeliveries: "Get pending deliveries",
  // Insights
  getStats: "Get business stats",
  getRevenueReport: "Get revenue report",
  getSalesByWilaya: "Get sales by wilaya",
  getReturnsSummary: "Get returns summary",
  getWilayaRisk: "Get wilaya risk",
  // Conversations
  searchConversations: "Search conversations",
  getConversationMessages: "Get conversation messages",
};
