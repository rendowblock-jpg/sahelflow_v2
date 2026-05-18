'use client'

import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <AlertTriangle size={28} style={{ color: 'var(--color-danger-400)' }} />
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--color-content-primary)',
            marginBottom: 8,
          }}
        >
          {t.errors.somethingWrong}
        </h1>
        {error.message && (
          <pre
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-tertiary)',
              border: '1px solid var(--color-line-primary)',
              color: 'var(--color-content-secondary)',
              fontSize: 12,
              fontFamily: 'monospace',
              textAlign: 'start',
              maxHeight: 72,
              overflow: 'hidden',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {error.message}
          </pre>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32 }}>
          <button className="sf-btn sf-btn-primary" onClick={reset}>
            <RefreshCw size={16} />
            {t.errors.tryAgain}
          </button>
          <Link href="/" className="sf-btn sf-btn-ghost">
            <Home size={16} />
            {t.errors.goHome}
          </Link>
        </div>
      </div>
    </div>
  )
}
