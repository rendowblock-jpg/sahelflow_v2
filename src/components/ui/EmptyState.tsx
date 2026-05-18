'use client'

import { Package, type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon = Package, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div
      className="sf-animate-in sf-stagger-1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-10) var(--space-6)',
        textAlign: 'center',
        minHeight: '400px',
      }}
    >
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-surface-tertiary)',
          color: 'var(--color-content-tertiary)',
          marginBottom: 'var(--space-5)',
          transition: 'transform var(--duration-normal) var(--ease-out-expo)',
        }}
      >
        <Icon size={36} />
      </div>
      <h3
        style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 600,
          color: 'var(--color-content-primary)',
          marginBottom: 'var(--space-2)',
          letterSpacing: 'var(--letter-spacing-tight)',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-content-secondary)',
          maxWidth: '420px',
          lineHeight: 'var(--line-height-normal)',
          marginBottom: actionLabel ? 'var(--space-5)' : '0',
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="sf-btn sf-btn-primary"
          style={{
            padding: 'var(--space-3) var(--space-6)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
