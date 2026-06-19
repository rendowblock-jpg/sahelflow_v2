/**
 * SahelFlow Shared TypeScript Interfaces
 * Central type definitions for all database tables
 */

// ===== PRODUCT VARIANTS =====
export interface ProductVariant {
	id: string;
	name: string; // e.g. "Size", "Color"
	options: string[]; // e.g. ["S", "M", "L", "XL"]
}

// ===== CATEGORIES =====
export interface Category {
	id: string;
	seller_id: string;
	name: string;
	slug: string;
	sort_order: number;
	created_at: string;
}

export type SellerPlan = "free" | "starter" | "pro" | "enterprise";

// ===== SELLERS =====
export interface Seller {
	id: string;
	email: string;
	full_name: string | null;
	business_name: string | null;
	phone: string | null;
	plan: SellerPlan;
	settings: Record<string, unknown>;
	shipping_rates: Record<
		number,
		{ home: number; desk: number; express: boolean }
	>;
	webhook_token: string; // NOT NULL DEFAULT gen_random_bytes(16) hex in DB
	webhook_orders_count: number | null; // nullable in DB (DEFAULT 0)
	webhook_last_sync: string | null;
	notification_settings: NotificationSettings | null;
	wilaya: string | null;
	categories: string[]; // NOT NULL DEFAULT '{}' in DB (TD2 fix — was string[] | null)
	delivery_partners: string[]; // NOT NULL DEFAULT '{}' in DB (TD2 fix)
	order_sources: string[]; // NOT NULL DEFAULT '{}' in DB (TD2 fix)
	onboarding_completed: boolean;
	slug: string | null;
	form_enabled: boolean;
	form_config: Record<string, unknown>;
	default_locale: "ar" | "fr" | "en";
	created_at: string;
	updated_at: string;
}

export interface NotificationSettings {
	newOrders: boolean;
	confirmations: boolean;
	highRisk: boolean;
	lowStock: boolean;
	delivery: boolean;
	weekly: boolean;
}

// ===== PRODUCTS =====
export interface Product {
	id: string;
	seller_id: string;
	name: string;
	sku: string | null;
	description: string | null;
	variants: ProductVariant[];
	category_id: string | null;
	stock: number | null; // nullable in DB (DEFAULT 0) — TD3 fix
	price: number;
	cost_price: number | null; // nullable in DB — TD3 fix
	image_url: string | null;
	active: boolean | null; // nullable in DB (DEFAULT true) — TD3 fix
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
}

// ===== CUSTOMERS =====
export interface Customer {
	id: string;
	seller_id: string;
	name: string | null;
	phone: string | null;
	wilaya: string | null;
	commune: string | null;
	address: string | null;
	order_count: number | null; // nullable in DB (DEFAULT 0) — TD3 fix
	total_spent: number | null; // nullable in DB (DEFAULT 0) — TD3 fix
	risk_score: number | null; // nullable in DB (DEFAULT 0) — TD3 fix
	is_blocked: boolean | null; // nullable in DB (DEFAULT false) — TD3 fix
	metadata: Record<string, unknown>;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
}

// ===== ORDERS =====
export type OrderStatus =
	| "draft"
	| "pending"
	| "confirmed"
	| "shipped"
	| "delivered"
	| "returned"
	| "refused"
	| "cancelled";

export type OrderSource =
	| "draft"
	| "manual"
	| "shopify"
	| "woocommerce"
	| "youcan"
	| "custom"
	| "ai"
	| "messenger"
	| "form"
	| "whatsapp"
	| "store";

export type ConfirmationStatus =
	| "rappel"
	| "en_attente"
	| "doublon"
	| "faux_numero"
	| "boite_vocale"
	| "confirmed"
	| "annule";

// TD1 fix: OrderItem accepts BOTH shapes that exist in the orders.items JSONB column.
// - Store/webhook path uses { product_name, unit_price }
// - AI extraction path uses { name, price }
// Code reads via `item.product_name || item.name` fallbacks. Both alias fields
// are optional so either shape satisfies the type.
export interface OrderItem {
	product_name?: string;
	name?: string; // AI-extraction alias
	quantity: number;
	unit_price?: number;
	price?: number; // AI-extraction alias
	product_id?: string;
	variant?: string | null;
}

export interface Order {
	id: string;
	seller_id: string;
	customer_id: string | null;
	order_number: string;
	status: OrderStatus;
	source: OrderSource;
	external_id: string | null;
	items: OrderItem[];
	total_price: number;
	delivery_cost: number;
	net_profit: number;
	wilaya: string | null;
	commune: string | null;
	address: string | null;
	tracking_id: string | null;
	delivery_company: string | null;
	delivery_type: "home" | "desk";
	risk_score: number;
	notes: string | null;
	confirmed_at: string | null;
	shipped_at: string | null;
	delivered_at: string | null;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
	confirmation_status: ConfirmationStatus | null;
	confirmation_attempts: number;
	confirmation_notes: string | null;
	upsell_offered: boolean;
	upsell_accepted: boolean;
	conversation_id: string | null;
	form_metadata: Record<string, unknown> | null;
	customer?: Customer | null;
}

// ===== DELIVERIES =====
export type DeliveryProvider = "yalidine" | "maystro" | "zrexpress" | "manual";
export type DeliveryStatus =
	| "pending"
	| "created"
	| "picked_up"
	| "in_transit"
	| "at_hub"
	| "out_for_delivery"
	| "delivered"
	| "returned"
	| "refused"
	| "failed";

export interface Delivery {
	id: string;
	order_id: string;
	seller_id: string;
	provider: DeliveryProvider;
	tracking_number: string | null;
	status: DeliveryStatus;
	raw_response: Record<string, unknown>;
	last_sync: string;
	created_at: string;
}

// ===== AUTOMATIONS =====
export interface Automation {
	id: string;
	seller_id: string;
	name: string;
	description: string | null;
	trigger_type: string;
	trigger_config: Record<string, unknown> | null;
	action_type: string;
	action_config: Record<string, unknown> | null;
	active: boolean;
	run_count: number;
	last_run_at: string | null;
	created_at: string;
}

// ===== DASHBOARD STATS =====
export interface DashboardStats {
	totalOrders: number;
	totalRevenue: number;
	totalProfit: number;
	totalProducts: number;
	totalCustomers: number;
	totalStock: number;
	deliveryRate: number;
	returnRate: number;
	byStatus: Record<string, number>;
	pendingOrders: number;
	confirmedOrders: number;
	codInTransit: number;
	codCleared: number;
	codPendingCollection: number;
	codAtRisk: number;
	confirmationRate: number;
}

// ===== COD CASH FLOW STATS =====
export interface CODStats {
	moneyInTransit: number;
	packagesAtDepot: number;
	returnsThisMonth: number;
	collectedThisMonth: number;
}

// ===== INTEGRATIONS =====
export interface Integration {
	id: string;
	seller_id: string;
	platform: string;
	credentials: Record<string, unknown>;
	is_active: boolean;
	last_sync: string | null;
	created_at: string;
}

// ===== WHATSAPP TEMPLATES =====
export type TemplateCategory =
	| "welcome"
	| "followup"
	| "confirmation"
	| "upsell"
	| "general";
export type TemplateLanguage = "ar" | "fr" | "en";

export interface WhatsAppTemplate {
	id: string;
	seller_id: string;
	name: string;
	slug: string;
	content: string;
	category: TemplateCategory;
	language: TemplateLanguage;
	active: boolean;
	created_at: string;
	updated_at: string;
}

// ===== WEBHOOK EVENTS =====
export interface WebhookEvent {
	id: string;
	seller_id: string;
	platform: string;
	event_id: string;
	topic: string | null;
	received_at: string;
}

// ===== IMPORT BATCHES =====
export type ImportBatchStatus =
	| "pending"
	| "preview"
	| "processing"
	| "completed"
	| "failed"
	| "cancelled";

export interface ImportBatch {
	id: string;
	seller_id: string;
	source: string;
	filename: string | null;
	row_count: number;
	processed_count: number;
	created_count: number;
	skipped_count: number;
	error_count: number;
	column_mapping: Record<string, unknown>;
	validation_errors: Array<Record<string, unknown>>;
	status: ImportBatchStatus;
	committed_at: string | null;
	created_at: string;
}

// ===== AI EXTRACTION =====
export interface AIExtraction {
	customer_name: string | undefined;
	phone: string | undefined;
	wilaya: string | undefined;
	commune: string | undefined;
	address: string | undefined;
	products: OrderItem[]; // TD1 fix: unified with OrderItem (AI fills name/price, code normalizes)
	confidence: number;
	raw_text: string;
}

// ===== RETURNS =====
// Canonical definitions live in @/types/returns — re-exported here for backward compatibility
export type {
	ReturnStatus,
	ReturnReason,
	ReturnResolutionType,
	ReturnItem,
	Return,
	ReturnNote,
} from './returns';
// ReturnNoteType is inlined into ReturnNote.type in returns.ts
export type ReturnNoteType = "note" | "status_change" | "system" | "customer";

// ===== EXPENSES =====
// Canonical definitions live in @/types/accounting — re-exported here for backward compatibility
export type { ExpenseCategory, Expense } from './accounting';

// ===== TEAM MEMBERS =====
export type TeamRole = "owner" | "admin" | "confirmer" | "packer" | "viewer";
export type TeamMemberStatus = "invited" | "active" | "suspended";

export interface TeamMember {
	id: string;
	seller_id: string;
	user_id: string | null;
	email: string;
	role: TeamRole;
	status: TeamMemberStatus;
	invited_by: string | null;
	invited_at: string | null;
	accepted_at: string | null;
	created_at: string;
	updated_at: string;
}

// ===== AI CHAT HISTORY =====
export interface AIChatSession {
	id: string;
	seller_id: string;
	title: string;
	message_count: number;
	created_at: string;
	updated_at: string;
}

export interface AIChatMessage {
	id: string;
	session_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	tool_calls: Record<string, unknown>[] | null;
	action_cards: Record<string, unknown>[] | null;
	created_at: string;
}

// ===== DAILY ANALYTICS REPORTS =====
export interface DailyAnalyticsReport {
	id: string;
	seller_id: string;
	report_date: string;
	total_orders: number;
	confirmed_orders: number;
	shipped_orders: number;
	delivered_orders: number;
	returned_orders: number;
	refused_orders: number;
	revenue: number;
	top_products: Record<string, unknown>[] | null;
	created_at: string;
}

// ===== NOTIFICATIONS =====
export type NotificationType =
	| "order"
	| "low_stock"
	| "risk"
	| "automation"
	| "system"
	| "welcome";

export interface Notification {
	id: string;
	seller_id: string;
	type: NotificationType;
	title: string;
	message: string;
	link: string | null;
	read: boolean;
	dismissed: boolean;
	metadata: Record<string, unknown> | null;
	created_at: string;
}

// ===== AGENT ACTIVITY (TD4 — was missing) =====
export interface AgentActivity {
        id: string;
        seller_id: string;
        type: string;
        title: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
}

// ===== CHANNELS (TD4 — was missing) =====
export type ChannelType = "whatsapp" | "messenger" | "instagram" | "telegram";

export interface Channel {
        id: string;
        seller_id: string;
        type: ChannelType;
        name: string | null;
        credentials: Record<string, unknown> | null;
        active: boolean | null;
        created_at: string;
}

// ===== CONVERSATIONS (TD4 — was missing) =====
export type ConversationStatus = "open" | "pending" | "closed" | "archived";

export interface Conversation {
        id: string;
        seller_id: string;
        channel_id: string | null;
        customer_id: string | null;
        platform_thread_id: string | null;
        status: ConversationStatus | null;
        unread_count: number | null;
        last_message_at: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
        last_message_preview: string | null;
        is_pinned: boolean;
        is_archived: boolean;
        labels: string[];
}

// ===== MESSAGES (TD4 — was missing) =====
export type MessageDirection = "inbound" | "outbound";
export type MessageContentType =
        | "text"
        | "image"
        | "audio"
        | "video"
        | "document"
        | "location"
        | "contact";

export interface Message {
        id: string;
        conversation_id: string;
        direction: MessageDirection;
        content: string | null;
        content_type: MessageContentType | null;
        media_url: string | null;
        ai_extraction: Record<string, unknown> | null;
        is_ai_reply: boolean | null;
        created_at: string;
        platform_message_id: string | null;
        reply_to_id: string | null;
        quoted_text: string | null;
}

// ===== WEBHOOK RETRY QUEUE (TD4 — was missing) =====
export type WebhookRetryStatus = "pending" | "processing" | "completed" | "failed" | "dead";

export interface WebhookRetryQueue {
        id: string;
        idempotency_key: string;
        event_type: string;
        payload: Record<string, unknown>;
        seller_id: string | null;
        attempts: number | null;
        max_attempts: number | null;
        next_retry_at: string | null;
        status: WebhookRetryStatus | null;
        error: string | null;
        created_at: string;
        completed_at: string | null;
        claimed_by: string | null;
        claimed_at: string | null;
        locked_until: string | null;
}

// ===== WILAYA RISK PROFILES (TD4 — was missing; DB-row shape) =====
// NOTE: src/lib/ai/risk-engine.ts has a separate WilayaRiskProfile interface
// with camelCase UI-layer fields. This is the DB-row shape (snake_case columns).
export interface WilayaRiskProfileRow {
        id: string;
        seller_id: string;
        wilaya: string;
        total_orders: number;
        return_rate: number;
        avg_delivery_days: number;
        risk_multiplier: number;
        updated_at: string;
}
