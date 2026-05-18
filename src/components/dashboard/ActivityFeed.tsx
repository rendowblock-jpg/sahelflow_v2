'use client'

import { useState, useEffect } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Package,
  Zap,
} from 'lucide-react'
import { getAgentActivity } from '@/lib/data/service'
import { useI18n } from '@/lib/i18n'

interface ActivityRow {
  id: string
  type: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const TYPE_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  order_confirmed: { icon: CheckCircle2, color: 'var(--color-accent-400)' },
  risk_flagged: { icon: AlertTriangle, color: 'var(--color-danger-400)' },
  message_extracted: { icon: MessageSquare, color: '#818cf8' },
  stock_alert: { icon: Package, color: 'var(--color-warn-400)' },
}

const DEFAULT_CONFIG = { icon: Zap, color: 'var(--color-brand-400)' }

export function ActivityFeed() {
  const { t, formatTimeAgo } = useI18n()
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function load() {
      try {
        const data = await getAgentActivity(20)
        setActivities(data as ActivityRow[])
      } catch {
        setActivities([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filters = [
    { id: 'all', label: t.dashboard.filterAll },
    { id: 'order_confirmed', label: t.dashboard.filterOrders },
    { id: 'risk_flagged', label: t.dashboard.filterAlerts },
    { id: 'message_extracted', label: t.dashboard.filterMessages },
    { id: 'stock_alert', label: t.dashboard.filterDeliveries },
  ]

  const filtered = filter === 'all'
    ? activities
    : activities.filter((a) => a.type === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="sf-section-title" style={{ margin: 0 }}>
          {t.dashboard.agentActivity}
        </h3>
      </div>

      {/* Filters — pill shape (Linear/Supabase pattern) */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '3px 10px',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: filter === f.id
                ? 'rgba(99, 102, 241, 0.12)'
                : 'transparent',
              color: filter === f.id
                ? 'var(--color-brand-400)'
                : 'var(--color-content-tertiary)',
              border: 'none',
              boxShadow: filter === f.id
                ? '0 0 0 1px rgba(99,102,241,0.2)'
                : '0 0 0 1px var(--color-line-primary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.12s ease',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed — timeline items, no nested cards (Linear pattern) */}
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 380, overflowY: 'auto' }}>
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid var(--color-line-secondary)',
              }}>
                <div className="sf-skeleton" style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="sf-skeleton" style={{ width: '55%', height: 11, marginBottom: 5 }} />
                  <div className="sf-skeleton" style={{ width: '85%', height: 9 }} />
                </div>
              </div>
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '28px 16px',
            color: 'var(--color-content-tertiary)', fontSize: 13,
          }}>
            {t.dashboard.noActivity}
          </div>
        ) : (
          filtered.map((item, idx) => {
            const config = TYPE_CONFIG[item.type] || DEFAULT_CONFIG
            const Icon = config.icon
            return (
              /* Timeline row — no card nesting (Linear pattern) */
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '9px 0',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--color-line-secondary)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {/* Icon — 28px, 6px radius, color-tinted bg */}
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `color-mix(in srgb, ${config.color} 10%, transparent)`,
                  color: config.color,
                  flexShrink: 0,
                }}>
                  <Icon size={13} strokeWidth={1.75} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 12, fontWeight: 500,
                    color: 'var(--color-content-primary)',
                    marginBottom: 1,
                  }}>
                    {item.title}
                  </p>
                  {item.description && (
                    <p style={{
                      fontSize: 11,
                      color: 'var(--color-content-tertiary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Timestamp with tnum */}
                <span style={{
                  fontSize: 10,
                  color: 'var(--color-content-tertiary)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  fontFeatureSettings: '"tnum" 1',
                }}>
                  {formatTimeAgo(item.created_at)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
