'use client'

import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  variant: 'brand' | 'success' | 'warning' | 'danger'
  icon?: LucideIcon
}

function StatCardComponent({ label, value, variant, icon: Icon }: StatCardProps) {
  return (
    <div className={`sf-card sf-stat sf-stat-${variant}`}>
      <div className="sf-flex-between">
        <div>
          <p className="sf-stat-label">{label}</p>
          <p className="sf-stat-value">{value}</p>
        </div>
        {Icon && <Icon size={20} style={{ color: 'var(--color-content-tertiary)' }} />}
      </div>
    </div>
  )
}

export const StatCard = memo(StatCardComponent)
