'use client'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  radius?: string
  className?: string
}

export function Skeleton({ width, height = 16, radius = 'var(--radius-sm)', className = '' }: SkeletonProps) {
  return (
    <div
      className={`sf-skeleton ${className}`}
      style={{
        width: width || '100%',
        height,
        borderRadius: radius,
      }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="sf-card" style={{ padding: 'var(--space-5)' }}>
      <Skeleton width="40%" height={12} />
      <div style={{ height: 'var(--space-2)' }} />
      <Skeleton width="60%" height={24} />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="sf-card" style={{ padding: 0 }}>
      <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <Skeleton width="30%" height={14} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--color-line-secondary)',
          }}
        >
          <Skeleton width={60} height={12} />
          <Skeleton width="30%" height={12} />
          <Skeleton width={80} height={12} />
          <div style={{ marginInlineStart: 'auto' }}>
            <Skeleton width={60} height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}
