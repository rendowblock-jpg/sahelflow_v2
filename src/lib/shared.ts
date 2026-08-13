// ════════════════════════════════════════════════════════════════════════════
// SahelFlow — Shared Utilities & Status Configuration
// Single source of truth for status colors, labels, formatting
//
// NOTE: This module returns i18n KEYS (not translated strings). Callers must
// pass the key through `t()` (client) or `t()` from `getI18n()` (server) so
// the rendered label respects the active locale (en / fr / ar).
// ════════════════════════════════════════════════════════════════════════════

import { type Locale } from '@/lib/i18n'
import { type OrderStatus } from '@/types/domain'

// Currency formatting (formatDZD, formatDZDShort, formatDZDBare) lives in
// src/lib/utils.ts — the canonical source. Was duplicated here (Z-013).

// ── Date Formatting ──────────────────────────────────────────────────────────
//
// Locale-aware variants. The legacy `formatDate` / `formatDateShort` /
// `formatTime` / `timeAgo` / `getGreeting` / `getFormattedDate` helpers that
// hard-coded `fr-DZ` and French text have been removed — all call sites use
// the locale-aware versions in src/lib/utils.ts (which accept a `locale`
// argument) instead. The functions below are kept for any future callers that
// need a locale-aware variant from this module.

const LOCALE_TAG: Record<Locale, string> = {
  ar: 'ar-DZ',
  fr: 'fr-DZ',
  en: 'en-GB',
}

/** Locale-aware short date (e.g. "12 Jan 2025"). */
export function formatDate(iso: string | Date, locale: Locale = 'fr'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString(LOCALE_TAG[locale], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Locale-aware very-short date (e.g. "12 Jan"). */
export function formatDateShort(iso: string | Date, locale: Locale = 'fr'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString(LOCALE_TAG[locale], {
    day: '2-digit',
    month: 'short',
  })
}

/** Locale-aware time (e.g. "14:32"). */
export function formatTime(iso: string | Date, locale: Locale = 'fr'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString(LOCALE_TAG[locale], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Locale-aware number formatting. */

// ── Status Configuration ─────────────────────────────────────────────────────
//
// Each style carries an `i18nKey` instead of a hardcoded label. Callers render
// the label by passing the key through their `t()` function:
//   const style = orderStatusStyles[status]
//   <span>{t(style.i18nKey)}</span>

export interface StatusStyle {
  i18nKey: string
  dot: string
  bg: string
  text: string
  border: string
  icon: string
  ring: string
}

export const orderStatusStyles: Record<OrderStatus, StatusStyle> = {
  draft: {
    i18nKey: 'orders.status.draft',
    dot: 'bg-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/40',
    text: 'text-slate-700 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700/50',
    icon: '📝',
    ring: 'ring-slate-400/20',
  },
  pending: {
    i18nKey: 'orders.status.pending',
    dot: 'bg-warning',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-warning dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/50',
    icon: '⏳',
    ring: 'ring-amber-500/20',
  },
  confirmed: {
    i18nKey: 'orders.status.confirmed',
    dot: 'bg-teal-500',
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    text: 'text-teal-700 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-800/50',
    icon: '✓',
    ring: 'ring-teal-500/20',
  },
  shipped: {
    i18nKey: 'orders.status.shipped',
    dot: 'bg-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    text: 'text-violet-700 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-800/50',
    icon: '🚚',
    ring: 'ring-violet-500/20',
  },
  delivered: {
    i18nKey: 'orders.status.delivered',
    dot: 'bg-success',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-success dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800/50',
    icon: '✅',
    ring: 'ring-emerald-500/20',
  },
  returned: {
    i18nKey: 'orders.status.returned',
    dot: 'bg-destructive',
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-destructive dark:text-red-400',
    border: 'border-red-200 dark:border-red-800/50',
    icon: '↩',
    ring: 'ring-red-500/20',
  },
  refused: {
    i18nKey: 'orders.status.refused',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800/50',
    icon: '✕',
    ring: 'ring-rose-500/20',
  },
  cancelled: {
    i18nKey: 'orders.status.cancelled',
    dot: 'bg-muted-foreground',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    icon: '✕',
    ring: 'ring-gray-400/20',
  },
}

// ── Delivery Provider Config ─────────────────────────────────────────────────
//
// Brand names ("Yalidine", "ZR Express", "EcoTrack Pro", "Maystro") are proper nouns
// and are intentionally NOT translated — they appear the same in all locales.

export const deliveryProviderConfig: Record<string, { color: string; label: string }> = {
  yalidine: { color: 'bg-orange-500', label: 'Yalidine' },
  maystro: { color: 'bg-teal-500', label: 'Maystro' },
  zrexpress: { color: 'bg-teal-500', label: 'ZR Express' },
  zr_express: { color: 'bg-teal-500', label: 'ZR Express' },
  ecotrack: { color: 'bg-sky-500', label: 'EcoTrack Pro' },
  noest: { color: 'bg-sky-500', label: 'EcoTrack Pro' },
}

// ── Customer Status Config ───────────────────────────────────────────────────

export const customerStatusConfig: Record<string, { i18nKey: string; color: string; bg: string }> = {
  active: { i18nKey: 'common.active', color: 'text-success dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50' },
  inactive: { i18nKey: 'common.inactive', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
  blocked: { i18nKey: 'common.blocked', color: 'text-destructive dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50' },
}

// ── Risk Score Helper ────────────────────────────────────────────────────────

export interface RiskConfig {
  i18nKey: string
  color: string
  bg: string
  progressColor: string
}

export function getRiskConfig(score: number): RiskConfig {
  if (score <= 30) return { i18nKey: 'customers.riskLow', color: 'text-success dark:text-emerald-400', bg: 'bg-success', progressColor: 'bg-success' }
  if (score <= 60) return { i18nKey: 'customers.riskMedium', color: 'text-warning dark:text-amber-400', bg: 'bg-warning', progressColor: 'bg-warning' }
  return { i18nKey: 'customers.riskHigh', color: 'text-destructive dark:text-red-400', bg: 'bg-destructive', progressColor: 'bg-destructive' }
}
