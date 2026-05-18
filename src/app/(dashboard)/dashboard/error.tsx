'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[Dashboard Error Boundary]:', error)
  }, [error])

  return (
    <div className="sf-p-6" style={{ minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div className="sf-card sf-p-8" style={{ maxWidth: 400, width: '100%' }}>
        <AlertCircle size={48} color="var(--color-danger)" style={{ margin: '0 auto 1rem' }} />
        <h2 className="sf-text-xl sf-font-semibold sf-mb-2">Something went wrong!</h2>
        <p className="sf-text-sm sf-text-secondary sf-mb-6">
          {error.message || 'An unexpected error occurred in the dashboard.'}
        </p>
        <button
          onClick={() => reset()}
          className="sf-btn sf-btn-primary sf-w-full"
        >
          {t.common.retry || 'Try again'}
        </button>
      </div>
    </div>
  )
}
