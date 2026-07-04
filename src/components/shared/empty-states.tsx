"use client";

/**
 * Empty state catalog (Phase 10 — R-2 gold-standard pattern).
 *
 * Top-tier apps show illustrated + actionable empty states, not bare
 * "No data found". This catalog provides a crafted empty state for each
 * page type, with:
 *   - An icon (the "illustration" — we use Lucide icons in a tinted tile)
 *   - A headline (what's empty)
 *   - A subline (why it might be empty + what to do)
 *   - A primary CTA (the next action)
 *   - A secondary link (learn more / import)
 *
 * Usage:
 *   <OrdersEmptyState onCreate={() => setOpen(true)} />
 *   <CustomersEmptyState />
 */

import { EmptyState } from "./empty-state";
import { useI18n } from "@/hooks/use-i18n";
import {
  Package, Users, ShoppingCart, Truck, RotateCcw, MessageCircle,
  Zap, BarChart3, ShieldAlert, Store, Upload,
} from "lucide-react";

interface EmptyStateProps {
  onCreate?: () => void;
  onImport?: () => void;
}

export function OrdersEmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={ShoppingCart}
      title={t("orders.empty.title")}
      description={t("orders.empty.description")}
      actionLabel={t("orders.createOrder")}
      onAction={onCreate}
    />
  );
}

export function CustomersEmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Users}
      title={t("customers.empty.title") || "No customers yet"}
      description={t("customers.empty.description") || "Add your first customer or import from CSV to get started."}
      actionLabel={t("customers.add") || "Add customer"}
      onAction={onCreate}
    />
  );
}

export function ProductsEmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Package}
      title={t("products.empty.title") || "No products yet"}
      description={t("products.empty.description") || "Add your first product to start creating orders."}
      actionLabel={t("products.add") || "Add product"}
      onAction={onCreate}
    />
  );
}

export function DeliveriesEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Truck}
      title={t("deliveries.empty.title") || "No deliveries yet"}
      description={t("deliveries.empty.description") || "Deliveries appear here when you ship orders. Connect a delivery provider in Settings to enable automatic tracking."}
    />
  );
}

export function ReturnsEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={RotateCcw}
      title={t("returns.empty.title") || "No returns yet"}
      description={t("returns.empty.description") || "Returns appear here when customers request them. Track return reasons and refund status."}
    />
  );
}

export function InboxEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={MessageCircle}
      title={t("inbox.empty.title") || "No conversations yet"}
      description={t("inbox.empty.description") || "Connect your WhatsApp account in Settings to start receiving customer messages. AI-powered order extraction works automatically."}
    />
  );
}

export function AutomationsEmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Zap}
      title={t("automations.empty.title") || "No automations yet"}
      description={t("automations.empty.description") || "Automations fire on events like order created, delivered, or customer blacklisted. Create your first automation to save time on repetitive tasks."}
      actionLabel={t("automations.create") || "Create automation"}
      onAction={onCreate}
    />
  );
}

export function AnalyticsEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={BarChart3}
      title={t("analytics.empty.title") || "No data yet"}
      description={t("analytics.empty.description") || "Analytics appear here once you have orders. Create your first order to see revenue trends, return rates, and wilaya performance."}
    />
  );
}

export function RiskEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={ShieldAlert}
      title={t("risk.empty.title") || "No risk assessments yet"}
      description={t("risk.empty.description") || "Risk assessments appear here when orders are created. The risk engine scores orders based on wilaya, phone reputation, and customer history."}
    />
  );
}

export function StorefrontsEmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Store}
      title={t("storefronts.empty.title") || "No storefronts yet"}
      description={t("storefronts.empty.description") || "Create a COD storefront to receive orders directly from customers via a public link."}
      actionLabel={t("storefronts.create") || "Create storefront"}
      onAction={onCreate}
    />
  );
}

export function ImportsEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Upload}
      title={t("imports.empty.title") || "No imports yet"}
      description={t("imports.empty.description") || "Import customers, products, or orders from CSV files. Download the template for the correct format."}
    />
  );
}
