'use client'

import Link from 'next/link'
import { Home, LayoutDashboard } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function NotFound() {
  const { t } = useI18n()

  return (
    <div
      className="sf-slide-up"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p
          style={{
            fontSize: 120,
            fontWeight: 800,
            color: 'var(--color-brand-400)',
            opacity: 0.15,
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--color-content-primary)',
            marginBottom: 8,
          }}
        >
          {t.errors.pageNotFound}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-content-secondary)',
            marginBottom: 32,
            lineHeight: 1.6,
          }}
        >
          {t.errors.pageNotFoundDesc}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login" className="sf-btn sf-btn-primary">
            <Home size={16} />
            {t.errors.goHome}
          </Link>
          <Link href="/dashboard" className="sf-btn sf-btn-ghost">
            <LayoutDashboard size={16} />
            {t.errors.goToDashboard}
          </Link>
        </div>
      </div>
    </div>
  )
}
