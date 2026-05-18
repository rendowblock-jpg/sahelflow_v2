'use client'

import { X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useI18n } from '@/lib/i18n'
import type { ReactNode } from 'react'

interface SlideOutPanelProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  ariaLabel?: string
}

export function SlideOutPanel({ open, onClose, title, children, ariaLabel }: SlideOutPanelProps) {
  const { t } = useI18n()
  const trapRef = useFocusTrap(open, onClose)

  if (!open) return null

  return (
    <div
      className="sf-slideout-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={trapRef}
        className="sf-slideout"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || t.common.closePanel}
      >
        <div className="sf-slideout__header">
          <div>{title}</div>
          <button
            onClick={onClose}
            aria-label={t.common.closePanel}
            style={{ background: 'none', border: 'none', color: 'var(--color-content-secondary)', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sf-slideout__body">
          {children}
        </div>
      </div>
    </div>
  )
}
