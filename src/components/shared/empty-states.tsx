"use client";

import type * as React from "react";

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
  Zap, BarChart3, ShieldAlert, Store, Upload, SearchX,
} from "lucide-react";

interface EmptyStateProps {
  onCreate?: () => void;
  onImport?: () => void;
  /**
   * Filtered-empty: the active search/filters matched nothing. Distinct from
   * first use — the primary action clears the scope instead of teaching.
   */
  filtered?: boolean;
  /** Clears the active filters; rendered as the filtered-empty CTA. */
  onClearFilters?: () => void;
  /**
   * Explicit create-action node for the first-use state (e.g. a form dialog
   * trigger), overriding the plain actionLabel button.
   */
  createAction?: React.ReactNode;
}

export function OrdersEmptyState({
  onCreate,
  filtered,
  onClearFilters,
  createAction,
}: EmptyStateProps) {
  const { t } = useI18n();
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("orders.filteredEmpty.title")}
        description={t("orders.filteredEmpty.description")}
        actionLabel={onClearFilters ? t("common.clearFilters") : undefined}
        onAction={onClearFilters}
      />
    );
  }
  return (
    <EmptyState
      icon={ShoppingCart}
      title={t("orders.empty.title")}
      description={t("orders.empty.description")}
      actionLabel={t("orders.createOrder")}
      onAction={onCreate}
      action={createAction}
    />
  );
}

export function CustomersEmptyState({
  onCreate,
  filtered,
  onClearFilters,
}: EmptyStateProps) {
  const { t } = useI18n();
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("customers.filteredEmpty.title")}
        description={t("customers.filteredEmpty.description")}
        actionLabel={onClearFilters ? t("common.clearFilters") : undefined}
        onAction={onClearFilters}
      />
    );
  }
  return (
    <EmptyState
      icon={Users}
      title={t("customers.empty.title")}
      description={t("customers.empty.description")}
      actionLabel={t("customers.add")}
      onAction={onCreate}
    />
  );
}

export function ProductsEmptyState({
  onCreate,
  filtered,
  onClearFilters,
}: EmptyStateProps) {
  const { t } = useI18n();
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("products.filteredEmpty.title")}
        description={t("products.filteredEmpty.description")}
        actionLabel={onClearFilters ? t("common.clearFilters") : undefined}
        onAction={onClearFilters}
      />
    );
  }
  return (
    <EmptyState
      icon={Package}
      title={t("products.empty.title")}
      description={t("products.empty.description")}
      actionLabel={t("products.add")}
      onAction={onCreate}
    />
  );
}

export function DeliveriesEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Truck}
      title={t("deliveries.empty.title")}
      description={t("deliveries.empty.description")}
    />
  );
}

export function ReturnsEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={RotateCcw}
      title={t("returns.empty.title")}
      description={t("returns.empty.description")}
    />
  );
}

export function InboxEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={MessageCircle}
      title={t("inbox.empty.title")}
      description={t("inbox.empty.description")}
    />
  );
}

export function AutomationsEmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Zap}
      title={t("automations.empty.title")}
      description={t("automations.empty.description")}
      actionLabel={t("automations.create")}
      onAction={onCreate}
    />
  );
}

export function AnalyticsEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={BarChart3}
      title={t("analytics.empty.title")}
      description={t("analytics.empty.description")}
    />
  );
}

export function RiskEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={ShieldAlert}
      title={t("risk.empty.title")}
      description={t("risk.empty.description")}
    />
  );
}

export function StorefrontsEmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Store}
      title={t("storefronts.empty.title")}
      description={t("storefronts.empty.description")}
      actionLabel={t("storefronts.create")}
      onAction={onCreate}
    />
  );
}

export function ImportsEmptyState() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Upload}
      title={t("imports.empty.title")}
      description={t("imports.empty.description")}
    />
  );
}
