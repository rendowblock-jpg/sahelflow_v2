// ════════════════════════════════════════════════════════════════════════════
// SahelFlow — Shared Utilities & Status Configuration
// Single source of truth for status colors, labels, formatting
// ════════════════════════════════════════════════════════════════════════════

import { type OrderStatus } from '@/types/domain'

// Currency formatting (formatDZD, formatDZDShort, formatDZDBare) lives in
// src/lib/utils.ts — the canonical source. Was duplicated here (Z-013).

// ── Date Formatting ──────────────────────────────────────────────────────────

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('fr-DZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('fr-DZ', {
    day: '2-digit',
    month: 'short',
  })
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString('fr-DZ', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Il y a ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `Il y a ${days}j`
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return "Bon après-midi"
  return 'Bonsoir'
}

export function getFormattedDate(): string {
  return new Date().toLocaleDateString('fr-DZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ── Status Configuration ─────────────────────────────────────────────────────

export interface StatusStyle {
  label: string
  labelAr: string
  dot: string
  bg: string
  text: string
  border: string
  icon: string
  ring: string
}

export const orderStatusStyles: Record<OrderStatus, StatusStyle> = {
  draft: {
    label: 'Brouillon',
    labelAr: 'مسودة',
    dot: 'bg-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/40',
    text: 'text-slate-700 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700/50',
    icon: '📝',
    ring: 'ring-slate-400/20',
  },
  pending: {
    label: 'En attente',
    labelAr: 'قيد الانتظار',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/50',
    icon: '⏳',
    ring: 'ring-amber-500/20',
  },
  confirmed: {
    label: 'Confirmé',
    labelAr: 'مؤكد',
    dot: 'bg-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800/50',
    icon: '✓',
    ring: 'ring-sky-500/20',
  },
  shipped: {
    label: 'Expédié',
    labelAr: 'مشحون',
    dot: 'bg-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    text: 'text-violet-700 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-800/50',
    icon: '🚚',
    ring: 'ring-violet-500/20',
  },
  delivered: {
    label: 'Livré',
    labelAr: 'تم التسليم',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800/50',
    icon: '✅',
    ring: 'ring-emerald-500/20',
  },
  returned: {
    label: 'Retourné',
    labelAr: 'مرتجع',
    dot: 'bg-red-500',
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800/50',
    icon: '↩',
    ring: 'ring-red-500/20',
  },
  refused: {
    label: 'Refusé',
    labelAr: 'مرفوض',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800/50',
    icon: '✕',
    ring: 'ring-rose-500/20',
  },
  cancelled: {
    label: 'Annulé',
    labelAr: 'ملغى',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/40',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-700/50',
    icon: '✕',
    ring: 'ring-gray-400/20',
  },
}

// ── Delivery Provider Config ─────────────────────────────────────────────────

export const deliveryProviderConfig: Record<string, { color: string; label: string }> = {
  yalidine: { color: 'bg-orange-500', label: 'Yalidine' },
  maystro: { color: 'bg-blue-500', label: 'Maystro' },
  zrexpress: { color: 'bg-teal-500', label: 'ZR Express' },
  zr_express: { color: 'bg-teal-500', label: 'ZR Express' },
  dhd: { color: 'bg-rose-500', label: 'DHD' },
}

// ── Customer Status Config ───────────────────────────────────────────────────

export const customerStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Actif', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50' },
  inactive: { label: 'Inactif', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/50' },
  blocked: { label: 'Bloqué', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50' },
}

// ── Risk Score Helper ────────────────────────────────────────────────────────

export function getRiskConfig(score: number): { label: string; color: string; bg: string; progressColor: string } {
  if (score <= 30) return { label: 'Faible', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500', progressColor: 'bg-emerald-500' }
  if (score <= 60) return { label: 'Moyen', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500', progressColor: 'bg-amber-500' }
  return { label: 'Élevé', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-500', progressColor: 'bg-red-500' }
}

// ── Number Formatting ────────────────────────────────────────────────────────

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-DZ').format(n)
}
