'use client'

import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export function PageLoader() {
  const { t } = useI18n()
  return (
    <div className="sf-flex-center" style={{ minHeight: 400, color: 'var(--color-content-secondary)' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginInlineEnd: 8 }} />
      {t.common.loading}
    </div>
  )
}
