# R-4 — Medusa + Chatwoot Domain Deep-Dive

> Two open-source projects most architecturally similar to SahelFlow's domain (Algerian COD e-commerce + WhatsApp inbox).
> **Medusa** (commerce platform, TypeScript) — bar for order/inventory/fulfillment/returns/customers/pricing/automation depth.
> **Chatwoot** (omnichannel inbox, Ruby on Rails + Vue) — bar for conversation/message/contact/inbox/routing/automation depth.
>
> All file:line citations refer to `/tmp/research/medusa` and `/tmp/research/chatwoot` clones (depth-1).

---

## 1. Medusa — Domain Modeling Deep-Dive

### 1.1 Order State Machine

Medusa separates "order status" (the simple lifecycle of the order record) from "order changes" (the pending, in-progress mutations requested by customer or agent — returns, exchanges, claims, edits, transfers).

**`OrderStatus` enum** (`packages/core/utils/src/order/status.ts:6-31`):
```ts
export enum OrderStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  DRAFT = "draft",
  ARCHIVED = "archived",
  CANCELED = "canceled",
  REQUIRES_ACTION = "requires_action",
}
```

Only **6 statuses**, deliberately minimal. Compare with SahelFlow's 8 (`draft`, `pending`, `confirmed`, `shipped`, `delivered`, `returned`, `refused`, `cancelled` — `src/lib/order-transitions.ts:26-35`). Medusa pushes shipping/fulfillment/return/refund state into child entities, **not** into the order's status enum — order status only describes the order's place in its top-level lifecycle. `REQUIRES_ACTION` is the only "soft" state (e.g. payment failed mid-fulfillment, return partially received and needs human decision).

**Completion flow** (`packages/modules/order/src/services/order-module-service.ts:4057-4120`):
```ts
async completeOrder(orderId, sharedContext) {
  const orders = await this.listOrders_({ id: orderIds }, {}, sharedContext)
  const notAllowed: string[] = []
  for (const order of orders) {
    if ([OrderStatus.CANCELED].includes(order.status as any)) notAllowed.push(order.id)
    order.status = OrderStatus.COMPLETED
  }
  if (notAllowed.length) throw new MedusaError(/* ... */)
  await this.orderService_.update(/* status: COMPLETED */)
}
```
The complete workflow (`packages/core/core-flows/src/order/workflows/complete-orders.ts:49-72`) emits `order.completed` and exposes a `ordersCompleted` **hook** for downstream customization.

**Cancel flow** (`order-module-service.ts:4122-4176`): sets `canceled_at`, validates nothing else is in flight, fires `order.canceled`.

### 1.2 Cart → Order (the conversion flow)

This is the single most important commerce flow and Medusa treats it with extreme rigor. The whole workflow is **idempotent**, **transaction-locked**, and **compensable** (`packages/core/core-flows/src/cart/workflows/complete-cart.ts:303-672`):

1. **Acquire lock** (`complete-cart.ts:311-315`): `acquireLockStep({ key: input.id, timeout: 30, ttl: 120 })` — distributed lock prevents two concurrent completions of the same cart. SahelFlow has zero locking.
2. **Idempotency check** (`complete-cart.ts:317-340`): `useRemoteQueryStep({ entity: "order_cart" })` — if an `order_cart` link already exists, the workflow returns the existing order ID instead of creating a duplicate. The workflow-level config `{ idempotent: false, retentionTime: THREE_DAYS }` (line 308) keeps the workflow state around for 3 days for inspection/compensation.
3. **Validate cart** (`complete-cart.ts:342-351`):
   - `validateCartItemsStep` — every variant still exists, is published, in stock at the requested quantity.
   - `validateCartPaymentsStep` — at least one authorized payment session exists.
   - `compensatePaymentIfNeededStep` — if the workflow later fails after payment capture, this step's compensation refunds.
4. **`when("create-order", ...)` branch** (line 358) — only runs the heavy creation if `orderId` is null (first completion). Subsequent retries skip to lock release.
5. **`cartToOrder` transform** (lines 405-489) — denormalizes cart items + shipping methods + addresses into the order shape, including tax lines, adjustments, credit lines, promo codes. Order is created with `status: OrderStatus.PENDING`.
6. **Parallel side-effects** (lines 597-609):
   - `createRemoteLinkStep` — links `order ↔ cart`, `order ↔ promotion`, `order ↔ payment_collection`.
   - `updateCartsStep` — sets `completed_at`.
   - `reserveInventoryStep` — creates `ReservationItem` rows.
   - `registerUsageStep` — increments promotion usage counters.
   - `emitEventStep` — fires `order.placed` at `EventPriority.CRITICAL`.
7. **Payment authorization** is the very last step (`complete-cart.ts:621-625`) — Medusa deliberately delays authorization to minimize the window where a captured payment might need to be reversed.
8. **`addOrderTransactionStep`** (line 647) — records capture transactions against the order.

The workflow exposes two **hooks** for downstream customization: `validate` (pre-flight) and `orderCreated` (post-creation) (`complete-cart.ts:352, 652`). The hooks receive `{ input, cart | order_id, additional_data }` so custom modules can attach arbitrary data via `additional_data`.

### 1.3 Fulfillment (Shipments, Tracking, Carriers)

Medusa does **not** model "carrier" directly — it models `FulfillmentProvider` (pluggable adapter, e.g. `manual`, `fedex`, `ups`), `ShippingOption` (a sellable shipping product), `FulfillmentSet` + `ServiceZone` + `GeoZone` (the geographic routing of shipping options), and `Fulfillment` (the actual physical shipment).

**`Fulfillment` model** (`packages/modules/fulfillment/src/models/fulfillment.ts:9-54`):
```ts
packed_at, shipped_at, marked_shipped_by, delivered_at, canceled_at  // lifecycle timestamps
requires_shipping: boolean
data: json                                                            // provider-specific payload
items: hasMany(FulfillmentItem)                                       // what was physically shipped
labels: hasMany(FulfillmentLabel)                                     // tracking numbers
provider: hasOne(FulfillmentProvider)
shipping_option: belongsTo(ShippingOption)
delivery_address: hasOne(FulfillmentAddress)
```

**`FulfillmentItem`** (`fulfillment-item.ts:5-28`): `title, sku, barcode, quantity, line_item_id, inventory_item_id` — note the dual link: to the **order line item** (for customer-facing display) **and** to the **inventory item** (for stock movement). SahelFlow has no equivalent — items are only on the order, no separate fulfillment record.

**`FulfillmentLabel`** (`fulfillment-label.ts:5-13`): `tracking_number, tracking_url, label_url` — multiple labels per fulfillment (e.g. multi-package shipments). SahelFlow's `Delivery` model has one `trackingNumber` + one `labelUrl` (Prisma `schema.prisma:182-197`).

**`ShippingOption`** model has `provider_id`, `price_type` (`flat` | `calculated`), `data` (provider config), and rules (`shipping-option-rule.ts`) for conditional pricing (e.g. "free over 100 DZD"). SahelFlow has hardcoded per-wilaya cost tables in delivery adapters (`src/lib/integrations/delivery/yalidine.ts:95+`).

**Create-fulfillment workflow** (`packages/core/core-flows/src/order/workflows/create-fulfillment.ts`) creates the `Fulfillment` via the provider, links it to the order, decrements stocked_quantity + deletes reservation_items, emits `order.fulfillment_created`.

**Mark-delivered workflow** (`mark-order-fulfillment-as-delivered.ts`) — separate step, not coupled to creation. This is important: SahelFlow conflates order-level "delivered" with delivery-level "delivered"; Medusa keeps them separate (an order has many fulfillments, each with its own delivered_at).

### 1.4 Returns, Exchanges, Claims, Refunds

This is where Medusa's depth is most visible. Three distinct RMA flows, each with its own state machine and workflow family:

**`ReturnStatus` enum** (`packages/core/utils/src/order/status.ts:38-59`):
```ts
OPEN, REQUESTED, RECEIVED, PARTIALLY_RECEIVED, CANCELED
```

**`Return` model** (`packages/modules/order/src/models/return.ts:9-56`):
```ts
order_version, display_id, status, location_id, no_notification,
refund_amount, created_by, requested_at, received_at, canceled_at,
order: belongsTo, exchange: hasOne, claim: hasOne,
items: hasMany(ReturnItem), shipping_methods: hasMany, transactions: hasMany
```
Note `refund_amount` is a **BigNumber** on the return itself — Medusa calculates and locks the refund at request time, not at receive time.

**Return workflow family** (`packages/core/core-flows/src/order/workflows/return/` — 21 files):
- `begin-return.ts` — opens the return draft (status=OPEN).
- `request-item-return.ts` / `update-request-item-return.ts` / `dismiss-item-return-request.ts` — line-item-level mutations on the draft.
- `create-return-shipping-method.ts` — attaches return shipping.
- `confirm-return-request.ts` — locks the request, sets status=REQUESTED, emits `order.return_requested`.
- `begin-receive-return.ts` / `receive-item-return-request.ts` / `confirm-receive-return-request.ts` — physical receipt, with `receive-now` shortcut for in-store.
- `receive-complete-return.ts` — finalizes: restocks items at `location_id`, marks return RECEIVED, triggers refund calculation.
- `cancel-return.ts` / `cancel-request-return.ts` / `cancel-receive-return.ts` — three separate cancels (draft / requested / mid-receive), each with its own validation.

**Create-complete-return** (`return/create-complete-return.ts:353-487`) is the storefront one-shot path: request + receive in a single workflow. Validates `throwIfOrderIsCancelled`, `throwIfItemsDoesNotExistsInOrder`, `validateReturnReasons`, `validateCustomRefundAmount` (refund ≤ item_total). The `prepareFulfillmentData` transform (lines 135-190) reverses the delivery address — the **stock location address becomes the delivery destination** for the return.

**Claims** (`OrderClaim` model + `claim/` workflow dir, 15 files): customer-facing "this item was wrong/missing/broken, refund or replace me". Two types (`ClaimType`): `REFUND` or `REPLACE`. Reasons (`ClaimReason`): `MISSING_ITEM, WRONG_ITEM, PRODUCTION_FAILURE, OTHER`. Each claim creates its own `Return` (for the bad item) + new line items (for the replacement).

**Exchanges** (`OrderExchange` model + `exchange/` workflow dir, 12 files): customer wants to swap an item for a different variant/size. Always involves a Return + new line items. No refund unless the price differs.

**Order Edits** (`order-edit/` workflow dir, 12 files): admin-initiated change to a placed order — add items, change quantities, change shipping. Generates a new order **version** (`order.version` increments from 1). Customer must confirm before the edit takes effect (`confirm-order-edit-request.ts`). The order keeps both versions in the DB; the admin sees a preview (`get-order-detail.ts` returns `orderPreview` with proposed changes applied).

**`OrderChange` + `OrderChangeAction`** (`order-change.ts`, `order-change-action.ts`): the **append-only ledger** that powers edits/claims/exchanges/returns/transfers. Every mutation is recorded as an `OrderChangeAction` (action types: `ITEM_ADD, ITEM_REMOVE, ITEM_UPDATE, FULFILL_ITEM, SHIP_ITEM, DELIVER_ITEM, RETURN_ITEM, RECEIVE_RETURN_ITEM, RECEIVE_DAMAGED_RETURN_ITEM, REINSTATE_ITEM, WRITE_OFF_ITEM, CANCEL_RETURN, CANCEL_ITEM_FULFILLMENT, SHIPPING_ADD/REMOVE/UPDATE, PROMOTION_ADD/REMOVE, ...` — 24 action types in `utils/actions/`). The change has a lifecycle: `PENDING → REQUESTED → CONFIRMED / DECLINED / CANCELED`, with `requested_by, confirmed_by, declined_by, canceled_by, declined_reason`. SahelFlow has zero concept of order changes — every order mutation just overwrites the order row.

**Refunds / money movement**: `OrderTransaction` (`transaction.ts:11-37`) — `amount, currency_code, reference (e.g. "capture" | "refund"), reference_id, order_id, return_id, exchange_id, claim_id`. Refunds are first-class transactions linked to the originating RMA. Multiple partial refunds are supported.

### 1.5 Inventory (Reservations, Multi-Warehouse, Ledger)

Three models, separating **what** is stocked from **where** it's stocked from **who has reserved it**:

**`InventoryItem`** (`inventory-item.ts:5-43`): the global stock-keeping unit.
```ts
sku (unique), origin_country, hs_code, mid_code, material,
weight, length, height, width, requires_shipping,
location_levels: hasMany(InventoryLevel),
reservation_items: hasMany(ReservationItem),
reserved_quantity: computed, stocked_quantity: computed
```

**`InventoryLevel`** (`inventory-level.ts:4-36`): per-location stock.
```ts
location_id, stocked_quantity, reserved_quantity, incoming_quantity,
inventory_item: belongsTo, available_quantity: computed
// unique on (inventory_item_id, location_id)
```

**`ReservationItem`** (`reservation-item.ts:5-40`): a soft-hold on stock for a specific line item.
```ts
line_item_id, allow_backorder, location_id, quantity,
raw_quantity: json, external_id, created_by
```

**Key insight**: `reserved_quantity` exists on both `InventoryItem` (aggregate) and `InventoryLevel` (per-warehouse). `available_quantity = stocked_quantity - reserved_quantity`. Reservations are **soft** — they don't decrement `stocked_quantity`. Stock is only decremented when the fulfillment is created (`create-fulfillment` workflow calls `confirmInventory` which deletes the reservation and decrements `stocked_quantity`).

**Stock movements ledger**: Medusa doesn't have an explicit ledger table in the module — the audit trail comes from (a) the immutable `OrderChangeAction` log, (b) `ReservationItem` create/delete events, (c) `InventoryLevel` updates wrapped in transactions. SahelFlow has **no** reservation concept — stock is decremented directly on `confirmed` transition (`order-service.ts:160-171`), which means a confirmed-then-cancelled order round-trips the stock counter but provides no audit trail of who held what when.

**Multi-warehouse**: `StockLocation` model + `stock-location.ts:8` (`address_id, name, metadata`). `FulfillmentSet` belongs to a `StockLocation` and groups `ServiceZone`s — geographic routing. `ShippingOption` belongs to a `FulfillmentSet`. So the chain is: `StockLocation → FulfillmentSet → ServiceZone → GeoZone → ShippingOption`. SahelFlow has one global stock per product (`Product.stock`, `schema.prisma`).

### 1.6 Customers (Guest vs Registered, Addresses, Segmentation)

**`Customer` model** (`customer.ts:6-37`):
```ts
company_name, first_name, last_name, email, phone, has_account,
groups: manyToMany(CustomerGroup) via CustomerGroupCustomer,
addresses: hasMany(CustomerAddress)
// unique on (email, has_account) — allows a guest email and a registered email to coexist
```

The `(email, has_account)` unique constraint is the guest/registered split — a guest can place orders with `has_account=false`, then later sign up; the same email gets a new `has_account=true` row. SahelFlow's `Customer` (`schema.prisma:96-120`) is single-row per phone, no email field at all, no has_account flag.

**Customer groups** for segmentation (B2B vs retail, VIP, wholesale pricing). Linked to price lists via `PriceList.rules` ("customer_group_id in [...]").

**Multiple carts**: a customer can have multiple carts simultaneously (abandoned carts feature). Medusa tracks cart ↔ customer via remote link, not via a foreign key on the cart.

### 1.7 Pricing, Discounts, Gift Cards

**Pricing** is its own module, separated from products. Two layers:

**`PriceSet`** + **`Price`** (`pricing/src/models/`): a price set is a group of prices for one currency/region/min-quantity combo. `Price` has `currency_code, amount, min_quantity, max_quantity, price_list_id, price_rules`.

**`PriceList`** (`price-list.ts:9-37`): the "discount price book" concept.
```ts
title, description, status (DRAFT|ACTIVE), type (SALE|OVERRIDE),
starts_at, ends_at, rules_count,
prices: hasMany, price_list_rules: hasMany
```

Two types:
- `SALE` — applies on top of the base price (lowest wins).
- `OVERRIDE` — replaces the base price entirely.

**Price calculation** (`pricing-module.ts:391-470`): `calculatePrices(pricingFilters, pricingContext)` returns `{ calculated_price, original_price, price_list_id, price_list_type }`. The resolution:
1. Find all matching prices for the variant × currency × context.
2. If `OVERRIDE` price list matches → use it (lowest if multiple).
3. If `SALE` price list matches → use min(price_list_price, default_price); set `original_price = default_price` for the strikethrough display.
4. `price_list_rules` allow scoping: `customer_group_id`, `region_id`, `currency_code`, `sales_channel_id`, custom attributes.

**Promotions** (`promotion/src/models/`): full coupon engine.
- `Promotion` (`promotion.ts:6-62`): `code` (unique), `is_automatic` (auto-applied), `is_tax_inclusive`, `limit` (max uses), `used` (current count), `type` (STANDARD | BUYGET), `status` (DRAFT | ACTIVE | INACTIVE | EXPIRED), `campaign_id`.
- `ApplicationMethod` (`application-method.ts:5-45`): `value, currency_code, max_quantity, apply_to_quantity, buy_rules_min_quantity, type` (PERCENTAGE | FIXED), `target_type` (ITEMS | SHIPPING_METHODS | ORDER), `allocation` (EACH | ACROSS | ONCE), `target_rules`, `buy_rules`.
- `PromotionRule` + `PromotionRuleValue`: rule engine conditions (`attribute, operator, values`) — `customer_group_id in [vip, wholesale]`, `minimum_quantity >= 3`, etc.
- `Campaign` + `CampaignBudget` + `CampaignBudgetUsage`: marketing campaign tracking with spend limits.

**Compute-actions engine** (`promotion/src/utils/compute-actions/`): `getComputedActionsForItems`, `getComputedActionsForBuyGet`, `getComputedActionsForShippingMethods`, `getComputedActionsForUsage` — produces a list of `ComputedActions` (`addItemAdjustment`, `addShippingMethodAdjustment`, `campaignBudgetReached`) which the cart workflow applies. Supports **stacking** (multiple promotions apply in sequence with `appliedPromotionsMap` tracking prior discounts), `ONCE | EACH | ACROSS` allocation, and budget exhaustion checks.

**Gift cards** are modeled as a special `GiftCard` entity + `GiftCardTransaction` ledger — every redemption is an auditable transaction, not a balance decrement.

SahelFlow has **no** pricing/discount/gift-card layer. Unit prices are baked into `OrderItem.unitPrice` at extraction time. There's no concept of a price list, no promotion engine, no customer-group-scoped pricing.

### 1.8 Multi-Currency / Multi-Region / Tax

**Region** (`region.ts:4-11`): `name, currency_code, automatic_taxes, countries: hasMany(RegionCountry)`. A region groups countries that share a currency + tax behavior.

**Currency** is its own module — every `amount` field is a `BigNumber` paired with a `currency_code` (no implicit DZD assumption). Medusa uses `MathBN` (a BigNumber wrapper) for all monetary math to avoid float precision errors. SahelFlow uses `Int` (cents) for all amounts — works for DZD-only but breaks if multi-currency is ever needed.

**Tax** module: `TaxRate`, `TaxRegion`, `TaxProvider` (pluggable — TaxJar, Vertex, custom). Each region can have `automatic_taxes=true` (computed at cart finalization) or require a provider. Tax lines are stored per line item (`LineItemTaxLine`) and per shipping method (`ShippingMethodTaxLine`).

### 1.9 Webhooks / Events / Subscribers (the "Automations" analog)

**Two parallel event systems**:

1. **Workflow events** (in-process, orchestration-aware) — `emitEventStep` in workflows fires typed events like `order.placed`, `order.fulfillment_created`, `order.return_requested`, `order.return_received`, `order.claim_created`, `order.exchange_created`, `order.transfer_requested`, `order.completed`, `order.archived`, `order.canceled`, `cart.created`, `cart.updated`, `cart.customer_updated`, `customer.created`, `customer.updated`. Defined in `packages/core/utils/src/core-flows/events.ts` — **~60 distinct event names** across all modules. Each event has documented payload shape.

2. **Subscribers** (`packages/core/framework/src/subscribers/types.ts:7-16`):
```ts
export type SubscriberConfig = { event: string | string[], context?: SubscriberContext }
export type SubscriberArgs<T> = { event: Event<T>, container: MedusaContainer, pluginOptions }
```
A subscriber is a file that exports `default async ({ event, container }) => { ... }` and a config `{ event: "order.placed" }`. The framework auto-loads all subscribers in `src/subscribers/**`. The event bus is pluggable (local in-memory or Redis pub/sub) via `event-bus-local` / `event-bus-redis` modules.

**This is the Medusa equivalent of SahelFlow's automations** — except it's: (a) typed, (b) covers the entire domain (60+ events vs SahelFlow's 10), (c) async + transactional (events fire after commit, never block the caller), (d) extensible by third-party plugins without modifying core.

---

## 2. Medusa — Architecture Patterns

### 2.1 Module / Service / Workflow Boundaries

**Modules** (`packages/modules/`): 30+ vertical slices — `order`, `cart`, `fulfillment`, `inventory`, `pricing`, `promotion`, `customer`, `payment`, `product`, `region`, `tax`, `sales-channel`, `stock-location`, `notification`, `auth`, `user`, `api-key`, `rbac`, `locking`, `index`, etc. Each module exposes:
- **Models** (`models/*.ts`) — DML entity definitions.
- **Services** (`services/*.ts`) — the module's public API (e.g. `IOrderModuleService.completeOrder`).
- **Migrations** — auto-generated from DML.
- **Repositories** (legacy, mostly replaced by DML + MedusaContext).

**Modules don't reference each other directly** — they communicate via:
- **Remote links** (`packages/modules/link-modules/`) — declarative cross-module FKs (`Order` ←link→ `Cart`, `Order` ←link→ `Promotion`).
- **Remote queries** (`useRemoteQueryStep({ entry_point: "orders", fields: [...] })`) — the orchestration layer queries across modules without coupling.
- **Events** — loose coupling via the event bus.

This is the architectural answer to "how do we avoid a god-object": the order module knows nothing about the inventory module. The cart→order workflow is the **orchestrator** that calls both services and links them via remote links.

### 2.2 Workflow Pattern

**`createWorkflow`** + **`createStep`** (`packages/core/workflows-sdk/src/utils/composer/`): a workflow is a DAG of steps. Each step:
- Has a **handler** (the action).
- Has a **compensation** function (the rollback).
- Receives `container` for DI.
- Returns a `StepResponse(result, compensateData)`.

**Example** (`complete-orders.ts:19-54`): the `completeOrdersStep` returns `{ id, status }` for compensation; if the workflow fails downstream, the compensation restores the previous status.

Workflows support:
- **`parallelize(...)`** — concurrent step execution.
- **`when("name", { data }, predicate).then(() => ...)`** — conditional sub-DAGs.
- **`transform({ data }, fn)`** — pure data transformations.
- **`createHook("name", data)`** — extension points where downstream customizers inject steps.
- **`runAsStep(subWorkflowInput)`** — compose workflows.
- **`@InjectManager()` / `@InjectTransactionManager()`** decorators on service methods — automatically wraps in a transaction when called inside a workflow context.
- **`@EmitEvents()`** — defers event emission until after transaction commit.

### 2.3 Transactions, Idempotency, Concurrency

- **Distributed locking**: `packages/modules/locking/` — Redis-backed (`@medusajs/locking-redis`) or in-memory. `acquireLockStep({ key, timeout, ttl })` / `releaseLockStep`. Used in `complete-cart.ts:311` to prevent duplicate order creation.
- **Idempotency**: complete-cart checks for an existing `order_cart` link before creating a new order. The workflow itself is configured with `retentionTime: THREE_DAYS` — failed runs are retained for inspection/replay.
- **Compensation**: every step has a rollback. The `compensatePaymentIfNeededStep` in cart completion explicitly refunds captured payments if the workflow fails post-capture.
- **Transaction managers**: `@InjectTransactionManager()` wraps a service method in `await this.baseRepository_.transaction(async (manager) => ...)` — MikroORM under the hood. The `@MedusaContext()` parameter carries the transaction context across service calls so child calls join the parent transaction.

### 2.4 Extension Mechanisms

- **Modules**: register a custom module in `medusa-config.ts → modules`. The framework's DI container resolves it.
- **Subscribers**: drop a file in `src/subscribers/my-subscriber.ts`.
- **Workflows**: extend a core workflow by calling `myWorkflow.hooks.orderCreated(({ order_id, additional_data }, { container }) => ...)`. The hook runs at the appropriate phase with access to the DI container.
- **Module links**: `src/links/order-custom.ts` defines a custom link; the framework auto-migrates the join table.
- **API routes**: file-based routing in `src/api/admin/...` and `src/api/store/...` with `defineMiddlewares` for custom middleware.
- **Plugins**: npm packages exporting `modules`, `subscribers`, `workflows`, `api` — installed via `plugins: [...]` in config.

---

## 3. Medusa — Admin UI Patterns

The admin dashboard (`packages/admin/dashboard/`) is a React Router 7 SPA with a layout-composer pattern.

### 3.1 Order Detail Page Structure

**File**: `packages/admin/dashboard/src/routes/orders/order-detail/order-detail.tsx:21-117` — the page composes sections via `<LayoutComposer>`:

```
main column:
  OrderActiveEditSection       (in-progress edit preview, if any)
  ActiveOrderClaimSection      (in-progress claim)
  ActiveOrderExchangeSection   (in-progress exchange)
  ActiveOrderReturnSection     (in-progress return)
  OrderGeneralSection          (status, dates, totals)
  OrderSummarySection          (line items with adjustments, taxes, promo codes)
  OrderPaymentSection          (payment status, captures, refunds)
  OrderFulfillmentSection      (per-fulfillment breakdown, tracking, unfulfilled items)

side column:
  OrderCustomerSection         (customer info, addresses, order history)
  OrderActivitySection         (timeline of all changes)
```

The `LayoutComposer` lets plugins inject widgets into specific zones via `widgetsZonePrefix="order.details"` (line 67). This is the architectural answer to "extensible admin UI" — a plugin can register a `order.details.main.before.OrderGeneralSection` widget and it appears in the right slot.

### 3.2 Order Activity Timeline

**`order-timeline.tsx`** is 1377 lines (`order-timeline.tsx:1-1377`). The `useActivityItems` hook (line 126-634) aggregates events from:
- `order_changes` (edits, claims, exchanges, returns, transfers, updates).
- `returns` (requested, received).
- `claims`, `exchanges` (with additional items).
- `payments` (captures, refunds).
- `notes` (admin notes).
- `fulfillments` (created, shipped, delivered, canceled).

Each event renders as an `OrderActivityItem` with title, timestamp, actor (avatar), and contextual children (e.g. "returned 2 items" expands to show the item list). Items >3 are collapsed into "Show more".

### 3.3 Fulfillment Section (Complex State)

**`order-fulfillment-section.tsx:38-199`**: shows the `UnfulfilledItemBreakdown` (separating `requires_shipping=true` from `false`) at the top, then each `Fulfillment` as its own card with:
- Status badge (NOT_FULFILLED / FULFILLED / SHIPPED / DELIVERED / CANCELED).
- Per-item fulfilled_quantity vs ordered_quantity.
- Tracking numbers as Copy + Link.
- Action menu: "Create shipment", "Mark delivered", "Cancel fulfillment".
- Stock location with address.

### 3.4 Order List (Bulk Actions)

**`order-list-table.tsx:17-81`**: `_DataTable` (TanStack Table wrapper) with:
- Filters via `useOrderTableFilters()` (status, sales channel, payment status, fulfillment status, date range, region, customer group, promo code).
- Sortable columns (`display_id`, `created_at`, `updated_at`).
- `navigateTo={(row) => \`/orders/${row.original.id}\`}` — row click navigates.
- `noRecords={{ message: t("orders.list.noRecordsMessage") }}` — explicit empty state.
- Export button at top-right.
- The newer `ConfigurableOrderListTable` (line 7, gated by `view_configurations` feature flag) lets users customize columns and save views.

### 3.5 Skeleton / Loading States

`order-detail.tsx:56-60`:
```tsx
if (isLoading || !order || isPreviewLoading) {
  return <TwoColumnPageSkeleton mainSections={4} sidebarSections={2} showJSON />
}
```
Skeletons mirror the real layout — main has 4 sections, sidebar has 2, JSON debug panel toggled.

---

## 4. Chatwoot — Domain Modeling Deep-Dive

### 4.1 Conversation Model

**`Conversation`** (`app/models/conversation.rb:54-390`):
```ruby
enum status: { open: 0, resolved: 1, pending: 2, snoozed: 3 }
enum priority: { low: 0, medium: 1, high: 2, urgent: 3 }
```

Four statuses (vs SahelFlow's WhatsApp Conversation which has no status enum — just `unreadCount` and `lastMessageAt`).

Key fields:
- `additional_attributes` (jsonb) — `referer`, `conversation_language`, `campaign_id`, `browser_language`, `type` (tweet/dm).
- `custom_attributes` (jsonb) — admin-defined custom fields.
- `cached_label_list` (text) — denormalized comma-separated labels (acts-as-taggable-on).
- `last_activity_at` — bumped on every message (separate from `updated_at` for sorting).
- `waiting_since` — set when customer sends a message and cleared on agent reply. Powers "longest waiting" SLA.
- `first_reply_created_at` — set once on the first agent reply. Powers FRT metrics.
- `agent_last_seen_at`, `assignee_last_seen_at`, `contact_last_seen_at` — three separate "seen" timestamps for read receipts.
- `snoozed_until` — for "snooze until tomorrow / next week / custom".
- `display_id` — auto-incrementing per account via DB trigger (line 383-385).
- `uuid` — for CSAT survey links (no auth needed).

**Status state machine**: NOT a formal state machine — `toggle_status` (line 154-159) is a manual flip. The `// FIXME: implement state machine with aasm` comment confirms this is tech debt. Transitions are enforced by callbacks (`execute_after_update_commit_callbacks` line 246-251) which dispatch events.

**Status event emission** (`notify_status_change` line 331-341): emits `CONVERSATION_OPENED`, `CONVERSATION_RESOLVED`, `CONVERSATION_STATUS_CHANGED`, `CONVERSATION_READ`, `CONVERSATION_CONTACT_CHANGED` — each conditional on `saved_change_to_*?`.

**Auto-resolve**: `scope :resolvable_not_waiting` (line 85-89) — conversations with `last_activity_at < Time.now - auto_resolve_after.minutes` and no `waiting_since`. A scheduled job resolves them.

### 4.2 Message Model

**`Message`** (`app/models/message.rb:41-460`):
```ruby
enum message_type: { incoming: 0, outgoing: 1, activity: 2, template: 3 }
enum content_type: { text: 0, input_text: 1, input_textarea: 2, input_email: 3,
                     input_select: 4, cards: 5, form: 6, article: 7, incoming_email: 8,
                     input_csat: 9, integrations: 10, sticker: 11, voice_call: 12 }
enum status: { sent: 0, delivered: 1, read: 2, failed: 3 }
```

**`message_type=activity`** is the key concept SahelFlow is missing. Activity messages are system-generated timeline entries ("Agent X assigned", "Conversation resolved", "Label added", "Priority changed to high", "SLA 'Gold' added") — they appear inline in the conversation thread but are visually distinct. Generated by `ActivityMessageHandler` concern (`app/models/concerns/activity_message_handler.rb`) — `handle_status_change`, `handle_priority_change`, `handle_label_change`, `handle_sla_policy_change` all fire on `after_update_commit` and create activity messages via `Conversations::ActivityMessageJob`.

**`content_type`** is incredibly rich — SahelFlow's `Message.body` is plain text. Chatwoot supports interactive cards, forms, email, CSAT surveys, integration blocks, stickers, voice calls.

**`content_attributes` (json)**: stores `submitted_email`, `items`, `submitted_values`, `email` (for incoming_email threading), `in_reply_to`, `deleted`, `external_created_at`, `external_error`, `data`, `translations`, `in_reply_to_external_id`, `is_unsupported`.

**`status`** with `sent/delivered/read/failed` powers the WhatsApp-style double-tick UI. The `MessageStatus.vue` component (`app/javascript/dashboard/components-next/message/MessageStatus.vue:1-93`) renders:
- `PROGRESS` → animated clock icon rotating every 500ms.
- `SENT` → single check mark.
- `DELIVERED` → double check mark (gray).
- `READ` → double check mark (blue `#7EB6FF`).

**Flooding prevention** (`message.rb:288-298`): `prevent_message_flooding` — rejects more than `Limits.conversation_message_per_minute_limit` messages per minute per conversation (protects against automation loops).

**Reopen-on-incoming** (`message.rb:403-410`): `reopen_conversation` — incoming customer message on a `resolved` or `snoozed` conversation reopens it (unless the contact is muted/blocked). For bot inboxes, reopened-as-pending. This is the inbox equivalent of an "order state machine" — the conversation auto-transitions based on message direction.

**`valid_first_reply?`** (`message.rb:224-233`): a message is the "first reply" only if it's outgoing, non-private, non-automation, non-campaign, and no prior outgoing human message exists. Used for FRT metric.

### 4.3 Contact Model

**`Contact`** (`app/models/contact.rb:44-256`):
```ruby
enum contact_type: { visitor: 0, lead: 1, customer: 2 }
```

- `additional_attributes` (jsonb): `company_name`, `city`, `country`, `browser_language`, `referer`, `social_profiles`.
- `custom_attributes` (jsonb): admin-defined via `CustomAttributeDefinition`.
- `identifier` (unique per account): external ID from CRM/sync.
- `phone_number` (E.164 validated), `email` (unique per account).
- `blocked` (boolean) — blocked contacts auto-resolve new conversations.
- `last_activity_at` — for sorting.

**Contact dedup/merge**: `CONTACT_MERGED` event (lib/events/types.rb). Merge flow takes a "base" contact and merges duplicates, re-linking all conversations, contact_inboxes, messages (sender), notes, csat_responses.

**ContactInbox** (`app/models/contact_inbox.rb:23-79`): the join between a contact and an inbox, with a **`source_id`** — the channel-specific identifier (e.g. WhatsApp phone number `+213555...`, Twilio SID, Facebook PSID). **One contact can have multiple ContactInboxes across channels** (WhatsApp + email + Instagram). The `source_id` is the canonical ID for sending messages via the channel API. SahelFlow has no equivalent — it only has `Conversation.contactPhone`.

`pubsub_token` on ContactInbox enables per-contact webhooks (Realtime channel via ActionCable/WebSockets).

### 4.4 Inbox Model + Channels

**`Inbox`** (`app/models/inbox.rb:42-272`):
```ruby
enum sender_name_type: { friendly: 0, professional: 1 }
```

Key fields:
- `channel_type` + `channel_id` (polymorphic → `Channel::Whatsapp`, `Channel::WebWidget`, `Channel::Email`, `Channel::FacebookPage`, `Channel::Instagram`, `Channel::Telegram`, `Channel::TwilioSms`, `Channel::Sms`, `Channel::Line`, `Channel::Tiktok`, `Channel::TwitterProfile`, `Channel::Api`).
- `greeting_enabled` + `greeting_message` — auto-greet new conversations.
- `working_hours_enabled` + `out_of_office_message` + `working_hours: hasMany`.
- `enable_auto_assignment` + `auto_assignment_config` (jsonb: `agent_ids, max_assignment_limit`).
- `csat_survey_enabled` + `csat_config`.
- `allow_messages_after_resolved`.
- `lock_to_single_conversation` — WhatsApp-style one conversation per contact.
- `inbox_members: hasMany` (which agents can see this inbox).
- `inbox_assignment_policy: hasOne` (v2 routing config).
- `agent_bot: hasOne` via `agent_bot_inbox` (bot integration).

**Channel::Whatsapp** (`app/models/channel/whatsapp.rb:20-149`):
```ruby
PROVIDERS = %w[default whatsapp_cloud].freeze
# default = 360dialog
```
- `phone_number` (unique), `provider`, `provider_config` (jsonb: `api_key, business_account_id, webhook_verify_token, source, calling_enabled`).
- `message_templates` (jsonb cached from Meta), `message_templates_last_updated`.
- `provider_service` returns `WhatsappCloudService` or `Whatsapp360DialogService` — strategy pattern.
- `setup_webhooks` / `teardown_webhooks` — auto-registers the webhook with Meta on inbox creation.
- `voice_calling_supported?` / `enable_voice_calling!` / `disable_voice_calling!` — Meta Calling API integration.
- `sync_templates` — pulls approved HSM templates from Meta.

SahelFlow's "WhatsApp inbox" is a single Baileys session with no concept of multiple inbox sources, no template management, no Meta Cloud API support, no provider switching.

### 4.5 Assignment & Routing

**Legacy (v1)** — `AutoAssignmentHandler` concern (`app/models/concerns/auto_assignment_handler.rb`):
- Triggered on `after_save` if `conversation_status_changed_to_open?`.
- `AutoAssignment::AgentAssignmentService` (`app/services/auto_assignment/agent_assignment_service.rb:4-37`):
  - Filters `allowed_agent_ids` to `online_agent_ids` (from `OnlineStatusTracker` Redis).
  - `InboxRoundRobinService` picks next agent via Redis round-robin key.
- Falls back silently if no agents online.

**V2** — `AutoAssignment::AssignmentService` (`app/services/auto_assignment/assignment_service.rb:1-60`):
- Bulk assignment job: `perform_bulk_assignment(limit: 100)`.
- Pulls `unassigned_conversations` ordered by policy:
  - `longest_waiting?` → `last_activity_at asc, created_at asc`.
  - default → `created_at asc`.
- `apply_age_exclusions` — skip stale conversations older than `exclude_older_than_hours` (default 7 days).
- Per-conversation: `find_available_agent` (respects `assignment_policy.max_open_conversations` per agent).
- Job coalescing: `AutoAssignment::AssignmentJob.enqueue_for_inbox(inbox_id)` debounces bursts.

**`InboxAssignmentPolicy`** model (separate from inbox) — `max_assignment_limit`, `longest_waiting`, `exclude_older_than_hours`. SahelFlow has **zero** routing — every conversation is open.

**Teams** (`app/models/team.rb`): agents grouped into teams; conversations can be assigned to a team (not just an agent); auto-assignment can be scoped to team members.

**Working hours** (`app/models/working_hour.rb`): per-inbox, per-day-of-week open/close; `OutOfOffisable` concern determines if "now" is within working hours; out-of-office auto-reply uses `out_of_office_message`.

### 4.6 Automation Rules (the SahelFlow "automations" analog)

**`AutomationRule`** (`app/models/automation_rule.rb:20-110`):
```ruby
event_name: string  # one of conversation_created, conversation_updated, conversation_opened,
                    # conversation_resolved, message_created
conditions: jsonb   # array of { attribute_key, filter_operator, values, query_operator }
actions: jsonb      # array of { action_name, action_params }
active: boolean
```

**Conditions** (`automation_rule.rb:37-40`): 16 attributes — `content, email, country_code, status, message_type, browser_language, assignee_id, team_id, referer, city, company_name, inbox_id, mail_subject, phone_number, priority, conversation_language, labels, private_note` + custom attributes from `CustomAttributeDefinition`.

**Actions** (`automation_rule.rb:42-47`): 17 actions — `send_message, add_label, remove_label, send_email_to_team, assign_team, assign_agent, remove_assigned_agent, remove_assigned_team, send_webhook_event, mute_conversation, send_attachment, change_status, resolve_conversation, open_conversation, pending_conversation, snooze_conversation, change_priority, send_email_transcript, add_private_note`.

**Conditions filter engine** (`app/services/automation_rules/conditions_filter_service.rb:1-210`):
- Loads filter definitions from `lib/filters/filter_keys.yml` (per-entity: conversations, contacts, messages).
- Builds a parameterized SQL query (`@query_string` + `@filter_values`) joining conversations ↔ contacts ↔ messages.
- Supports operators: `equal_to, not_equal_to, contains, does_not_contain, starts_with, ends_with, is_present, is_not_present, attribute_changed` (the last for transition-based triggers like "status changed from open to resolved").
- AND/OR query operators between conditions.
- Label queries use the `tags` + `taggings` tables (acts-as-taggable-on).
- Custom attributes query the jsonb `custom_attributes` column.

**Action executor** (`app/services/automation_rules/action_service.rb:1-67`):
```ruby
def perform
  @rule.actions.each do |action|
    @conversation.reload
    send(action[:action_name], action[:action_params])  # dynamic dispatch
  rescue StandardError => e
    ChatwootExceptionTracker.new(e, account: @account).capture_exception
  end
end
```
Sets `Current.executed_by = rule` so downstream events are flagged as automation-performed (preventing recursive loops). Per-action error isolation — one failing action doesn't stop the rest.

**Trigger listener** (`app/listeners/automation_rule_listener.rb:1-86`): subscribes to `conversation_created, conversation_updated, conversation_opened, conversation_resolved, message_created`. The `ignore_message_created_event?` check (line 82-85) skips activity messages and auto-reply emails to prevent loops.

**Macros** (`app/models/macro.rb`): reusable action sequences for agents (vs automations which are event-triggered). `ACTIONS_ATTRS` mirrors automation actions. Visibility: `personal | global` (agents have personal macros; admins share global).

### 4.7 Canned Responses / Saved Replies

**`CannedResponse`** (`app/models/canned_response.rb`):
```ruby
content, short_code (unique per account)
scope :order_by_search, ->(search) {
  # CASE WHEN short_code ILIKE 'foo%' THEN 1
  #      WHEN short_code ILIKE '%foo%' THEN 0.5
  #      WHEN content ILIKE '%foo%' THEN 0.2
  # ELSE 0 END DESC
}
```
Triggered in the reply box by typing `/` — fuzzy search by short code. SahelFlow has no equivalent.

### 4.8 Campaigns / Proactive Messages

**`Campaign`** (`app/models/campaign.rb:1-80`):
```ruby
enum campaign_type: { ongoing: 0, one_off: 1 }
enum campaign_status: { active: 0, completed: 1, processing: 2 }
```
- `audience` (jsonb): filter for which contacts to target.
- `trigger_rules` (jsonb): when to fire (for ongoing campaigns — triggered by visitor landing on the website).
- `template_params` (jsonb): WhatsApp HSM template + variables.
- `scheduled_at`: for one-off campaigns.
- `trigger_only_during_business_hours`.
- `sender_id`: which agent sends (or nil for bot).
- `trigger!` method (line 41-46) — for one-off: `mark_processing!` (acquires DB lock to prevent duplicate sends) → `execute_campaign`.
- WhatsApp campaigns gated behind `whatsapp_campaign` feature flag (Meta's 24-hour rule).

### 4.9 Reports / Analytics

**`ReportingEvent`** model + `ReportingEvents::MetricRegistry` (`app/services/reporting_events/metric_registry.rb:1-60`):
- Raw events: `first_response, conversation_resolved, reply_time, conversation_bot_resolved, conversation_bot_handoff`.
- Rollup metrics: `conversations_count, incoming_messages_count, outgoing_messages_count, avg_first_response_time, avg_resolution_time, reply_time, resolutions_count, bot_resolutions_count, bot_handoffs_count`.
- Each raw event expands to one or more rollup metrics with `aggregate: :count | :average` + `value_in_business_hours` (respects working hours).
- Periodic `ReportingEventsRollup` job aggregates raw events into hourly/daily rollups for fast dashboard queries.

---

## 5. Chatwoot — UX Patterns

### 5.1 Conversation List + Detail Layout

**`ConversationView.vue`** (`app/javascript/dashboard/routes/dashboard/conversation/ConversationView.vue:197-219`):
```vue
<section class="flex w-full h-full min-w-0">
  <ChatList ... />                                <!-- left: list -->
  <ConversationBox v-if="showMessageView" ...>    <!-- center: thread -->
    <SidepanelSwitch v-if="currentChat.id" />
  </ConversationBox>
  <ConversationSidebar v-if="shouldShowSidebar" :current-chat="currentChat" />  <!-- right: contact -->
  <CmdBarConversationSnooze />
</section>
```

Three-pane layout: **list (24%) | thread (flex) | contact sidebar (collapsible)**. Two layout modes:
- `CONDENSED` — list + thread, contact sidebar hidden by default.
- `EXPANDED` — list hidden when a conversation is selected, full-width thread.

Persisted in `uiSettings.conversation_display_type`.

### 5.2 Conversation Card (next-gen)

**`ConversationCard.vue`** (`app/javascript/dashboard/components-next/Conversation/ConversationCard/ConversationCard.vue:87-134`):
- Avatar (with availability status dot).
- Contact name (truncate).
- Priority icon (urgent/high/medium/low).
- Inbox icon (channel indicator).
- `lastActivityAt` (short timestamp).
- Message preview (last message).
- Labels row.
- SLA badge if applicable.
- Unread badge (`UnreadBadge.vue`).
- `@click` navigates; `@click.metaKey || ctrlKey` opens in new tab.

### 5.3 Real-time + Typing + Delivery Status

- **ActionCable** WebSocket for real-time message delivery + status updates.
- **Typing indicators** (`MessagesView.vue:114-125`): `typingUsersList` computed from `conversationTypingStatus` store. Renders "X is typing..." with animated dots.
- **Delivery status** (`MessageStatus.vue:1-93`): per-message icon — clock (progress), single check (sent), double-check gray (delivered), double-check blue (read). Tooltip explains.
- **Unread separator**: a divider line "Unread messages" between read and unread, with auto-scroll to first unread on conversation open (`MessagesView.vue:361-369`).

### 5.4 Contact Sidebar

**`ContactPanel.vue`** (`app/javascript/dashboard/routes/dashboard/conversation/ContactPanel.vue:1-80`):
- Drag-reorderable accordion items (`Draggable` from `vuedraggable`).
- Items: `ContactInfo, ContactNotes, ConversationInfo, ConversationAction, ConversationParticipant, ContactConversations, CustomAttributes, SharedFiles, MacrosList, ShopifyOrdersList, LinearIssuesList`.
- `useUISettings().isContactSidebarItemOpen(itemKey)` — per-item open/closed state.
- `conversationSidebarItemsOrder` — persisted order.
- Custom attributes section: admin-defined fields (text, number, list, link, date) per `CustomAttributeDefinition`.
- Conversation action: assign agent, assign team, add label, change status, change priority, snooze, mute, send transcript.

### 5.5 Command Palette (Ninja-keys)

**`commandbar.vue`** (`app/javascript/dashboard/routes/dashboard/commands/commandbar.vue:1-100`):
- `@chatwoot/ninja-keys` — web component.
- Sections: appearance, inbox, go-to, bulk-actions, conversation, snooze.
- **Composable-based registration** (`app/javascript/dashboard/composables/commands/`):
  - `useAppearanceHotKeys` — toggle theme, switch language, toggle compact view.
  - `useInboxHotKeys` — switch inbox, filter by status.
  - `useGoToCommandHotKeys` — jump to conversations / contacts / reports / settings.
  - `useConversationHotKeys` — assign agent/team, add/remove label, set priority, resolve, open, snooze, mute, send transcript, AI assist.
  - `useBulkActionsHotKeys` — select all, bulk assign, bulk resolve.
- Snooze supports NLP-parsed natural language ("snooze until tomorrow morning") → `generateSnoozeSuggestions`.
- Per-section placeholder text (snooze vs default).
- Cmd+K opens palette globally.

### 5.6 Bulk Actions

**`useBulkActions.js`** (`app/javascript/dashboard/composables/chatlist/useBulkActions.js:1-237`):
- `selectConversation(id, inboxId)` / `deSelectConversation` / `selectAllConversations(check, list)`.
- `selectedConversations` from `bulkActions/getSelectedConversationIds` store.
- Operations: `onAssignAgent`, `onAssignLabels`, `onRemoveLabels`, `onAssignTeam`, `onChangeStatus` (resolve/open/pending/snooze).
- Dispatches `bulkActions/process` action with `{ type: 'Conversation', ids, fields: { assignee_id, ... } }`.
- `useConversationRequiredAttributes` validates required fields before bulk resolve (e.g. can't resolve without assignee).
- Toast alerts: `BULK_ACTION.ASSIGN_SUCCESFUL` / `BULK_ACTION.ASSIGN_FAILED`.
- Visible action bar (`conversationBulkActions/Index.vue`, 211 lines) at bottom of list when any selected.

### 5.7 Empty States

**`EmptyState.vue`** (`app/javascript/dashboard/components/widgets/conversation/EmptyState/EmptyState.vue:1-99`):
- Loading state: `woot-loading-state` with `LOADING_INBOXES` or `LOADING_CONVERSATIONS` message.
- No inboxes + admin: `OnboardingView` (setup wizard CTA).
- No inboxes + agent: `EmptyStateMessage` with `NO_INBOX_AGENT`.
- No conversations at all: `NO_MESSAGE_1`.
- Conversations exist but none selected: `SELECT_A_CONVERSATION` (condensed) or `404` (expanded).
- Three distinct empty states for three distinct situations.

### 5.8 Loading / Error States

- Per-route `loading.tsx` and `error.tsx` files (Vue Router).
- Skeleton screens mirror real layout.
- Network failures: toast + retry button.
- WebSocket disconnection: banner with reconnect attempt count.

---

## 6. SahelFlow Gap Matrix

The most important section. For each major domain area: what SahelFlow does today vs what Medusa/Chatwoot do, and the concrete gap.

### 6.1 Orders

| Aspect | SahelFlow today | Medusa reference | Gap |
|---|---|---|---|
| **Status enum** | 8 statuses (draft/pending/confirmed/shipped/delivered/returned/refused/cancelled), `src/lib/order-transitions.ts:26-35` | 6 statuses + REQUIRES_ACTION (`status.ts:6-31`) — fulfillment/return/refund state lives in child entities | **SahelFlow conflates order status with fulfillment status.** No "requires_action" for stuck orders. |
| **State machine** | `ALLOWED_TRANSITIONS` table + `assertCanTransition` + side-effect triggers (`order-transitions.ts:59-134`). Single file. | Service methods + 30+ workflows + 24 OrderChangeActions + OrderChange ledger | **SahelFlow has no audit trail of mutations.** No "who changed status from X to Y when". No way to do partial-then-cancelled transitions safely. |
| **Order versioning** | None — overwrites the row | `Order.version` increments on edit; old versions retained | **Can't edit a placed order without losing the original.** No order-edit-then-confirm flow. |
| **Order changes ledger** | None | `OrderChange` + `OrderChangeAction` (24 action types, lifecycle PENDING→CONFIRMED/DECLINED) | **No history. Returns/cancellations silently mutate.** |
| **Cart→Order flow** | N/A — orders come from AI extraction or manual create (`order-service.ts:67-130`) | `complete-cart.ts:303-672` — locked, idempotent, compensable, with hooks | **No idempotency on order creation** — duplicate submissions create duplicate orders. `nextOrderNumber` is atomic but the create itself isn't. |
| **Concurrency control** | None | `acquireLockStep` (Redis distributed lock) on cart completion | **Race conditions** if two requests update the same order simultaneously. |

### 6.2 Deliveries / Fulfillment

| Aspect | SahelFlow today | Medusa reference | Gap |
|---|---|---|---|
| **Fulfillment model** | `Delivery` (1:1 with Order, `schema.prisma:182-197`) — single tracking number, single label URL | `Fulfillment` (N:1 with Order) — multiple fulfillments per order, each with multiple `FulfillmentItem` + multiple `FulfillmentLabel` | **One order = one shipment only.** Can't split an order across carriers or partial-ship. |
| **Carrier modeling** | `provider: "yalidine" | "maystro" | "zrexpress" | "dhd"` adapter pattern (`delivery/types.ts:95`) | `FulfillmentProvider` (pluggable) + `ShippingOption` + `FulfillmentSet` + `ServiceZone` + `GeoZone` | **No shipping option selection.** No "express vs standard vs pickup" choice. No geographic zone routing. |
| **Tracking events** | `DeliveryStatus` enum 10 values + `TrackingEvent[]` from adapter (`delivery/types.ts:14-25`) | `FulfillmentLabel.tracking_number + tracking_url` + provider webhooks update `packed_at/shipped_at/delivered_at` | **Medusa stores timestamps per fulfillment; SahelFlow has only `updatedAt`.** No "picked up at" / "out for delivery at" timestamps. |
| **Delivery attempts** | None | n/a (Medusa doesn't model attempts either — provider-specific) | Parity. **But SahelFlow should model failed-delivery-attempt count** (Algerian COD has high attempt rates). |
| **Stock location** | None — single global `Product.stock` | `StockLocation` + `FulfillmentSet.location_id` + `InventoryLevel.location_id` | **Single-warehouse only.** No multi-warehouse, no per-location stock. |
| **Inventory reservation** | None — stock decremented on `confirmed` (`order-service.ts:160-171`) | `ReservationItem` (soft hold) + `InventoryLevel.reserved_quantity` | **No reservation between order creation and fulfillment.** Confirmed order deducts immediately, cancellation restores — but no concept of "this stock is reserved for order X" mid-flow. |
| **Stock movement ledger** | None — just increment/decrement | Implicit via `OrderChangeAction` + `InventoryLevel` updates in transactions | **No audit trail of stock changes.** Can't answer "why did stock drop by 5 yesterday?". |

### 6.3 Returns / Exchanges / Refunds

| Aspect | SahelFlow today | Medusa reference | Gap |
|---|---|---|---|
| **Return model** | `Return` (N:1 with Order) — reason, status, type, exchangeOrderId, notes (`schema.prisma:237-252`) | `Return` with `status (OPEN/REQUESTED/RECEIVED/PARTIALLY_RECEIVED/CANCELED)`, `refund_amount`, `location_id`, `requested_at/received_at/canceled_at`, linked `OrderExchange`/`OrderClaim`, `ReturnItem[]` with per-item quantities | **No partial returns.** No "received but damaged" flag. No return shipping method. No refund amount at request time. |
| **Return status** | `requested | approved | rejected | received | restocked | exchanged | cancelled` (informal) | 5-state enum with formal transitions | SahelFlow's statuses are strings, no enum constraint, no transition table. |
| **Return items** | None — return is order-level | `ReturnItem` with `quantity, received_quantity, reason_id, note, subtotal, claim_id` | **Can't return 2 of 3 items.** Whole-order returns only. |
| **Return reasons** | `reason: String` | `ReturnReason` model with parent/child hierarchy + `ClaimReason` enum | **No structured reason taxonomy.** Can't report "X% of returns are 'wrong size'". |
| **Exchange flow** | `exchangeOrderId` field — links to a new order | `OrderExchange` model with `Return` + additional items + outbound shipping + price-difference refund/charge | **Just a link, no actual exchange workflow.** No automated "swap variant X for Y" with stock reservation + price diff calc. |
| **Claims** | None | `OrderClaim` with `ClaimType.REFUND/REPLACE` + `ClaimReason` | **No claim concept.** Wrong-item/missing-item/damaged handling is manual. |
| **Refunds** | None (COD — refund is cash at door) | `OrderTransaction` with `reference: "refund"`, linked to return/exchange/claim | **Cash refunds untracked.** No ledger of "refund 500 DZD to customer X for return Y". |
| **Restocking** | `triggersStockRestoration` on cancel/return/refused (`order-transitions.ts:123-126`) — increments `Product.stock` | `receive-return` workflow restocks at `location_id`, updates `InventoryLevel.stocked_quantity`, validates condition (damaged vs sellable) | **No condition check.** Returned items blindly re-enter sellable stock. No quarantine location. |

### 6.4 Customers

| Aspect | SahelFlow today | Medusa reference | Gap |
|---|---|---|---|
| **Customer model** | `Customer` (phone-unique, `schema.prisma:96-120`) — name, phone, phone2, wilaya, commune, address, orderCount, totalSpent, riskScore, isBlacklisted | `Customer` — `email` (unique with `has_account`), `has_account`, `groups`, `addresses: hasMany`, company_name | **No email. No has_account. No multi-address. No customer groups.** |
| **Guest vs registered** | No concept — every customer is the same | `has_account` flag + unique `(email, has_account)` — guests and registered can coexist | **No account/auth concept.** All customers are effectively guests. |
| **Customer groups** | None | `CustomerGroup` + `CustomerGroupCustomer` + scoped price lists | **No segmentation.** No VIP/wholesale/blacklist groups (blacklist is a boolean flag, not a group). |
| **Addresses** | Single address on customer + per-order address | `CustomerAddress` (N:1) — multiple shipping + billing addresses | **No saved addresses.** Customer must re-enter on every order. |
| **Order history** | Implicit via `Order.customerId` | Same — but with `order.version` for edit history | **No edit history per order.** |
| **PII handling** | `phoneEnc` (encrypted), `phoneBlindIndex` (HMAC for search), `nameBlindIndex` — `schema.prisma:100-101` | No encryption by default (Medusa assumes infra-level encryption at rest) | **SahelFlow is ahead here** — PII encryption is more rigorous than Medusa's default. |
| **Customer merge/dedupe** | None | Not in Medusa core either; Chatwoot has `CONTACT_MERGED` event + merge flow | **Same-customer-duplicate-phones is a real Algerian problem** (customers give phone1 vs phone2 inconsistently). |

### 6.5 Inbox / Conversations

| Aspect | SahelFlow today | Chatwoot reference | Gap |
|---|---|---|---|
| **Conversation model** | `Conversation` (`schema.prisma:203-217`) — channel, contactName, contactPhone, sourceId, lastMessageAt, unreadCount. **No status, no assignee, no priority, no labels.** | `Conversation` — `status (open/resolved/pending/snoozed)`, `priority (low/medium/high/urgent)`, `assignee`, `team`, `labels`, `snoozed_until`, `waiting_since`, `first_reply_created_at`, `agent_last_seen_at`, `assignee_last_seen_at`, `contact_last_seen_at`, `custom_attributes`, `additional_attributes` | **SahelFlow conversations are flat chat logs, not workflowed tickets.** No resolution, no assignment, no priority, no snooze, no SLA. |
| **Message model** | `Message` (`schema.prisma:219-231`) — body, direction (incoming/outgoing), timestamp, extractedOrderJson, extractionMethod. **No status, no content_type, no attachments, no sender.** | `Message` — `message_type (incoming/outgoing/activity/template)`, `content_type (13 types incl. cards/forms/email/csat/voice)`, `status (sent/delivered/read/failed)`, `content_attributes` (json), `sender` (polymorphic), `attachments`, `private` flag, `external_source_ids` | **SahelFlow messages are plain text only.** No delivery receipts, no activity messages, no attachments, no interactive content, no private notes. |
| **Activity messages** | None | `message_type=activity` — system-generated timeline entries ("X assigned", "Resolved", "Label added") | **No timeline.** Conversation is just customer/agent messages, no system events visible inline. |
| **Contact model** | `Customer` reused for inbox (name, phone) — no email, no custom attributes, no avatar | `Contact` — `email, phone_number, identifier, contact_type (visitor/lead/customer), additional_attributes (company/city/country), custom_attributes, blocked, last_activity_at`, avatar, multiple `ContactInbox`es per channel | **No contact entity at all in inbox.** Customer is conflated with contact. No per-channel source_id. |
| **Inbox model** | None — single Baileys WhatsApp session | `Inbox` — `channel_type` (polymorphic to 12 channel types), `inbox_members`, `working_hours`, `greeting_message`, `out_of_office_message`, `csat_config`, `auto_assignment_config`, `lock_to_single_conversation` | **One inbox, no multi-channel.** No working hours, no greeting, no CSAT. |
| **Multi-channel** | WhatsApp only (Baileys) | WhatsApp (360dialog + Cloud API), Web Widget, Email, FB/IG, Telegram, Twilio SMS, LINE, TikTok, Twitter, API | **Massive gap.** No email/Instagram/FB/Telegram support. |
| **WhatsApp providers** | Baileys (unofficial) only | 360dialog + WhatsApp Cloud API (`channel/whatsapp.rb:28`) — switchable per inbox | **Baileys has ban risk.** No official Meta Cloud API option. |
| **Templates (HSM)** | `WhatsAppTemplate` model exists | `Channel::Whatsapp.message_templates` cached from Meta + `sync_templates` | SahelFlow has the model but no sync, no per-template category tracking, no parameter validation. |
| **Assignment** | None | Auto-assignment v1 (round-robin) + v2 (capacity-aware, age-excluded, longest-waiting) + teams + working hours | **No assignment whatsoever.** Every conversation is everyone's. |
| **Real-time** | Custom WS via `whatsapp/ws-token` route | ActionCable + per-contact `pubsub_token` + `OnlineStatusTracker` Redis | SahelFlow has WS but no presence, no typing indicators. |
| **Typing indicators** | None | `conversationTypingStatus` store + `CONVERSATION_TYPING_ON/OFF` events + UI render | **Missing.** |
| **Delivery receipts** | None | `MessageStatus.vue` — sent/delivered/read/failed with double-tick UI | **Missing.** Can't tell if a WhatsApp message actually delivered. |
| **Bulk actions** | None | `useBulkActions.js` — select all, bulk assign/label/resolve/snooze | **Missing.** |
| **Command palette** | None | Ninja-keys global palette with 5 composables covering appearance/inbox/navigation/conversation/bulk | **Missing.** (SahelFlow should have one too — see R-2/R-3 findings.) |
| **Canned responses** | None | `CannedResponse` with `/short_code` trigger + fuzzy search | **Missing.** |
| **Macros** | None | `Macro` — reusable action sequences (assign + label + resolve in one click) | **Missing.** |
| **Snooze** | None | `snoozed_until` + NLP-parsed natural language ("snooze until tomorrow morning") | **Missing.** |
| **SLA** | None | `SlaPolicy` + `AppliedSla` (enterprise) — FRT/resolution targets per inbox/priority | **Missing.** (SahelFlow has `WilayaRiskProfile` for orders but nothing for conversations.) |
| **Reports** | `DailyAnalyticsReport` (orders/deliveries only) | `ReportingEvent` + `ReportingEventsRollup` + `MetricRegistry` — FRT, resolution time, reply time, bot resolution rate, agent activity | **No conversation analytics.** |
| **Campaigns** | None | `Campaign` — one-off + ongoing, audience filters, template params, scheduled_at, business-hours-only | **Missing.** No proactive WhatsApp broadcasts. |
| **CSAT** | None | `csat_survey_response` + `input_csat` content_type + auto-send on resolve | **Missing.** |

### 6.6 Automations

| Aspect | SahelFlow today | Chatwoot reference | Gap |
|---|---|---|---|
| **Triggers** | 10 events: `order.created/confirmed/shipped/delivered/returned/cancelled, customer.created/blacklisted, message.received, stock.low` (`engine.ts:25-35`) | 5 conversation events: `conversation_created/updated/opened/resolved, message_created` + extensible | **SahelFlow has more order triggers but zero conversation triggers.** No "conversation created" → "send greeting" automation. |
| **Conditions** | None — trigger-only matching | 16 attributes + custom attributes + `attribute_changed` operator + AND/OR + 8 filter operators | **SahelFlow automations fire on every matching trigger, no condition filtering.** Can't say "if order total > 5000 DZD then...". |
| **Actions** | 5 actions: `send_whatsapp, send_notification, tag_customer, update_status, create_order` (last is "skipped" placeholder, `engine.ts:171-179`) | 17 actions including assign_agent/team, add/remove_label, change_status/priority, send_email_to_team, send_attachment, send_webhook_event, mute, snooze, send_email_transcript, add_private_note | **SahelFlow has ~30% of the action vocabulary.** No webhook action, no email action, no label actions. |
| **Rule engine** | `dispatchTrigger` → `findMany({ trigger: event, isActive: true })` → parallel `executeAutomation` (`engine.ts:69-90`) | `ConditionsFilterService` builds parameterized SQL + `ActionService` dispatches via `send(action_name, params)` | **SahelFlow is trigger→action with no condition evaluation.** Chatwoot is a real rule engine. |
| **Loop prevention** | None (relies on fire-and-forget) | `Current.executed_by = rule` + `performed_by_automation?(event)` check + `prevent_message_flooding` rate limit + `ignore_message_created_event?` skips activity/auto-reply | **SahelFlow automations can loop indefinitely** (e.g. update_status → order.updated event → ... actually no, SahelFlow only fires on `order.{status}` so a same-status update is no-op; but multi-step chains are unguarded). |
| **Execution model** | Fire-and-forget `Promise.allSettled` (`engine.ts:83-85`) — never blocks caller | Synchronous in listener (blocks commit callbacks) but each action is isolated with `rescue StandardError` per action | SahelFlow's fire-and-forget is actually safer (no caller blocking) but loses ordering. |
| **Audit log** | `AutomationLog` (`schema.prisma:314-327`) — automationId, trigger, status, message, payload, createdAt | Per-action error tracking via `ChatwootExceptionTracker` + activity messages per action | **SahelFlow is ahead on audit log schema** but lacks per-action granularity (one log per automation run, not per action). |
| **Run stats** | `runCount, lastRunAt` on Automation | Not directly tracked on rule (use ReportingEvents) | **SahelFlow is ahead here.** |
| **UI** | `/automations` page with create/list/edit | Full rule builder UI with condition builder (attribute/operator/values) + action builder + test preview | **SahelFlow's automation UI is basic** — no visual rule builder. |

---

## 7. Top 15 Domain Gaps (Ranked by Impact)

The ranked summary appears in the final returned message to the orchestrator. Below is the full annotated list.

1. **Conversation status / workflow** (SahelFlow inbox has no status, assignee, priority, snooze, SLA). Affects: **inbox**. Chatwoot ref: `conversation.rb:75`.
2. **Order change ledger** (no audit trail of mutations). Affects: **orders, returns**. Medusa ref: `order-change.ts:5-44`.
3. **Multi-fulfillment per order** (1:1 Delivery:Order). Affects: **orders, deliveries**. Medusa ref: `fulfillment.ts:9-54`.
4. **Inventory reservations + multi-warehouse** (single `Product.stock`). Affects: **inventory, products**. Medusa ref: `reservation-item.ts:5-40`, `inventory-level.ts:4-36`.
5. **Return items + partial returns** (whole-order returns only). Affects: **returns**. Medusa ref: `return.ts:38-46`.
6. **Message status / delivery receipts** (no sent/delivered/read/failed). Affects: **inbox**. Chatwoot ref: `message.rb:103`, `MessageStatus.vue:47-55`.
7. **Activity messages / timeline** (no system events inline). Affects: **inbox, orders**. Chatwoot ref: `activity_message_handler.rb`.
8. **Auto-assignment + teams** (every conversation is everyone's). Affects: **inbox**. Chatwoot ref: `auto_assignment_handler.rb`, `assignment_service.rb`.
9. **Automation conditions engine** (trigger-only, no condition filtering). Affects: **automations**. Chatwoot ref: `conditions_filter_service.rb:1-210`.
10. **Order versioning + edit flow** (no edit-then-confirm). Affects: **orders**. Medusa ref: `order-change.ts:17`.
11. **Customer model depth** (no email, no has_account, no groups, no multi-address). Affects: **customers**. Medusa ref: `customer.ts:6-37`.
12. **WhatsApp multi-provider** (Baileys only — ban risk). Affects: **inbox**. Chatwoot ref: `channel/whatsapp.rb:28`.
13. **Bulk actions on conversations** (none). Affects: **inbox**. Chatwoot ref: `useBulkActions.js`.
14. **Canned responses / macros / command palette** (none). Affects: **inbox**. Chatwoot ref: `canned_response.rb`, `macro.rb`, `commandbar.vue`.
15. **Pricing / promotions / price lists** (none — fixed prices). Affects: **orders, products**. Medusa ref: `price-list.ts:9-37`, `promotion.ts:6-62`.

---

## Appendix: Key File Citations

### Medusa
- `packages/core/utils/src/order/status.ts:6-87` — OrderStatus, ReturnStatus, ClaimType, ClaimReason enums
- `packages/modules/order/src/models/order.ts:10-131` — Order model
- `packages/modules/order/src/models/return.ts:9-90` — Return model
- `packages/modules/order/src/models/transaction.ts:11-87` — OrderTransaction (refund ledger)
- `packages/modules/order/src/models/order-change.ts:5-44` — OrderChange (mutation ledger)
- `packages/modules/order/src/services/order-module-service.ts:4057-4176` — completeOrder + cancel
- `packages/modules/fulfillment/src/models/fulfillment.ts:9-54` — Fulfillment model
- `packages/modules/fulfillment/src/models/fulfillment-item.ts:5-28` — FulfillmentItem
- `packages/modules/fulfillment/src/models/fulfillment-label.ts:5-13` — FulfillmentLabel (tracking)
- `packages/modules/inventory/src/models/inventory-item.ts:5-43` — InventoryItem
- `packages/modules/inventory/src/models/inventory-level.ts:4-36` — InventoryLevel (per-location)
- `packages/modules/inventory/src/models/reservation-item.ts:5-40` — ReservationItem (soft hold)
- `packages/modules/customer/src/models/customer.ts:6-37` — Customer
- `packages/modules/pricing/src/models/price-list.ts:9-37` — PriceList (SALE/OVERRIDE)
- `packages/modules/pricing/src/services/pricing-module.ts:391-470` — calculatePrices
- `packages/modules/promotion/src/models/promotion.ts:6-62` — Promotion
- `packages/modules/promotion/src/models/application-method.ts:5-45` — ApplicationMethod
- `packages/modules/promotion/src/utils/compute-actions/line-items.ts:33-80` — promo compute engine
- `packages/core/core-flows/src/cart/workflows/complete-cart.ts:303-672` — cart→order workflow
- `packages/core/core-flows/src/order/workflows/return/create-complete-return.ts:353-487` — return workflow
- `packages/core/utils/src/core-flows/events.ts:115-265` — OrderWorkflowEvents (13 events)
- `packages/admin/dashboard/src/routes/orders/order-detail/order-detail.tsx:21-117` — admin order detail layout
- `packages/admin/dashboard/src/routes/orders/order-detail/components/order-activity-section/order-timeline.tsx:126-634` — timeline aggregator
- `packages/admin/dashboard/src/routes/orders/order-detail/components/order-fulfillment-section/order-fulfillment-section.tsx:38-199` — fulfillment breakdown

### Chatwoot
- `app/models/conversation.rb:54-390` — Conversation (4 statuses, 4 priorities)
- `app/models/message.rb:41-460` — Message (4 message_types, 13 content_types, 4 statuses)
- `app/models/contact.rb:44-256` — Contact
- `app/models/contact_inbox.rb:23-79` — ContactInbox (per-channel source_id)
- `app/models/inbox.rb:42-272` — Inbox (12 channel types, working hours, auto-assignment)
- `app/models/channel/whatsapp.rb:20-149` — WhatsApp channel (360dialog + Cloud API)
- `app/models/automation_rule.rb:20-110` — AutomationRule (16 conditions, 17 actions)
- `app/models/canned_response.rb` — CannedResponse
- `app/models/macro.rb` — Macro (reusable action sequences)
- `app/models/campaign.rb:1-80` — Campaign (one-off + ongoing)
- `app/models/concerns/activity_message_handler.rb` — Activity message generation
- `app/models/concerns/auto_assignment_handler.rb` — Auto-assignment v1 trigger
- `app/services/automation_rules/conditions_filter_service.rb:1-210` — Rule engine
- `app/services/automation_rules/action_service.rb:1-67` — Action executor
- `app/services/auto_assignment/agent_assignment_service.rb:1-37` — Round-robin v1
- `app/services/auto_assignment/assignment_service.rb:1-60` — Capacity-aware v2
- `app/services/reporting_events/metric_registry.rb:1-60` — Reports metric registry
- `app/listeners/automation_rule_listener.rb:1-86` — Event subscription
- `lib/events/types.rb:1-66` — All event names (~30)
- `app/javascript/dashboard/routes/dashboard/conversation/ConversationView.vue:197-219` — 3-pane layout
- `app/javascript/dashboard/components-next/Conversation/ConversationCard/ConversationCard.vue:87-134` — Conversation card
- `app/javascript/dashboard/components-next/message/MessageStatus.vue:1-93` — Delivery status icons
- `app/javascript/dashboard/components/widgets/conversation/EmptyState/EmptyState.vue:1-99` — Empty states
- `app/javascript/dashboard/routes/dashboard/commands/commandbar.vue:1-100` — Command palette
- `app/javascript/dashboard/composables/commands/useConversationHotKeys.js:1-80` — Conversation command set
- `app/javascript/dashboard/composables/chatlist/useBulkActions.js:1-237` — Bulk actions

### SahelFlow (current state)
- `prisma/schema.prisma:96-120` — Customer
- `prisma/schema.prisma:126-176` — Order + OrderItem
- `prisma/schema.prisma:182-197` — Delivery (1:1 with Order)
- `prisma/schema.prisma:203-231` — Conversation + Message
- `prisma/schema.prisma:237-262` — Return + ReturnNote
- `prisma/schema.prisma:297-327` — Automation + AutomationLog
- `src/lib/order-transitions.ts:26-134` — Order state machine (8 statuses)
- `src/lib/data/order-service.ts:67-221` — Order service (create, updateStatus, update)
- `src/lib/automations/engine.ts:25-311` — Automation engine (10 triggers, 5 actions)
- `src/lib/integrations/delivery/types.ts:14-148` — Delivery adapter interface
- `src/components/inbox/inbox-live.tsx:1-703` — Single WhatsApp inbox component
- `src/app/(dashboard)/orders/[id]/page.tsx:1-421` — Order detail page
