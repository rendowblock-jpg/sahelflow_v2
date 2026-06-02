/**
 * SahelFlow Type Barrel Export
 * Import all types from '@/types' instead of '@/types/database'
 */

// Core database types
export type {
  ProductVariant,
  Category,
  Seller,
  NotificationSettings,
  Product,
  Customer,
  OrderStatus,
  OrderSource,
  ConfirmationStatus,
  OrderItem,
  Order,
  DeliveryProvider,
  DeliveryStatus,
  Delivery,
  Automation,
  DashboardStats,
  CODStats,
  Integration,
  TemplateCategory,
  TemplateLanguage,
  WhatsAppTemplate,
  WebhookEvent,
  ImportBatchStatus,
  ImportBatch,
  AIExtraction,
} from './database';

// Agent configuration types
export type {
  OrderAgentConfig,
  CommAgentConfig,
  AgentConfig,
} from '../lib/agents/types';

export {
  DEFAULT_ORDER_AGENT_CONFIG,
  DEFAULT_COMM_AGENT_CONFIG,
  DEFAULT_AGENT_CONFIG,
} from '../lib/agents/types';

// Returns types
export type {
  ReturnStatus,
  ReturnReason,
  ReturnResolutionType,
  ReturnItem,
  Return,
  ReturnNote,
} from './returns';

// Accounting types
export type {
  ExpenseCategory,
  Expense,
  PnLSummary,
  ProductProfitability,
} from './accounting';


