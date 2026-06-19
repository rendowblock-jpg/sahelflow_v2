'use client'

import { useState } from 'react'
import { X, Sparkles, User, Phone, MapPin, Package, CheckCircle, Edit } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface AIOrderImportProps {
  onClose: () => void
  onOrderCreated: (orderData: Record<string, unknown>) => void
}

interface ExtractedOrder {
  customer_name?: string
  phone?: string
  wilaya?: string
  address?: string
  products: Array<{ name: string; quantity: number; variant?: string; unit_price?: number; price?: number }>
  confidence: number
}

export default function AIOrderImport({ onClose, onOrderCreated }: AIOrderImportProps) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedOrder | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ customer_name: '', phone: '', wilaya: '', address: '' })

  async function handleExtract() {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setExtracted(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract_order', message: text }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        setExtracted(data.data)
        setEditForm({
          customer_name: data.data.customer_name || '',
          phone: data.data.phone || '',
          wilaya: data.data.wilaya || '',
          address: data.data.address || '',
        })
      } else {
        setError(t.orders.importNoData)
      }
    } catch {
      setError(t.orders.importNoData)
    } finally {
      setLoading(false)
    }
  }

  function handleCreate() {
    if (!extracted) return
    const finalData = editing ? editForm : {
      customer_name: extracted.customer_name || '',
      phone: extracted.phone || '',
      wilaya: extracted.wilaya || '',
      address: extracted.address || '',
    }
    onOrderCreated({
      customer_name: finalData.customer_name,
      phone: finalData.phone,
      wilaya: finalData.wilaya,
      address: finalData.address,
      items: extracted.products.map(p => ({
        product_name: p.name,
        quantity: p.quantity,
        price: p.unit_price || p.price || 0,
        variant: p.variant,
      })),
    })
    onClose()
  }

  const confidenceColor = extracted
    ? extracted.confidence >= 0.7 ? '#10b981' : extracted.confidence >= 0.4 ? '#f59e0b' : '#ef4444'
    : '#888'

  return (
    <div className="sf-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sf-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="sf-flex-between" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={20} style={{ color: 'var(--color-brand-400)' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>{t.orders.importModalTitle}</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-content-secondary)', marginTop: 4 }}>
              {t.orders.importModalDesc}
            </p>
          </div>
          <button onClick={onClose} className="sf-btn sf-btn-ghost" style={{ padding: 6, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="sf-flex-col sf-gap-md">
          <textarea
            className="sf-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t.orders.importPaste || "السلام عليم، حاب نطلب parfum elite ليوم..."}
            rows={8}
            style={{ fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }}
          />

          {error && (
            <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>
          )}

          {!extracted && (
            <button
              className="sf-btn sf-btn-primary"
              onClick={handleExtract}
              disabled={loading || !text.trim()}
            >
              <Sparkles size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? t.orders.importExtracting : t.orders.importExtract}
            </button>
          )}

          {extracted && (
            <div className="sf-flex-col sf-gap-md sf-animate-fade">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.orders.importConfidence}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 120, height: 6, background: 'var(--color-surface-tertiary)', borderRadius: 99 }}>
                    <div style={{
                      width: `${Math.round(extracted.confidence * 100)}%`,
                      height: '100%', borderRadius: 99,
                      background: confidenceColor,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: confidenceColor }}>
                    {Math.round(extracted.confidence * 100)}%
                  </span>
                </div>
              </div>

              <div className="sf-card" style={{ background: 'var(--color-surface-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {editing ? (
                  <>
                    <div><label className="sf-label">{t.orders.customerName}<input className="sf-input" value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} /></label></div>
                    <div><label className="sf-label">{t.orders.phone}<input className="sf-input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" /></label></div>
                    <div><label className="sf-label">{t.dashboard.wilaya}<input className="sf-input" value={editForm.wilaya} onChange={e => setEditForm(f => ({ ...f, wilaya: e.target.value }))} /></label></div>
                    <div><label className="sf-label">{t.orders.address}<input className="sf-input" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} /></label></div>
                  </>
                ) : (
                  <>
                    {[
                      { icon: User, label: 'Customer', value: editForm.customer_name || extracted.customer_name },
                      { icon: Phone, label: 'Phone', value: editForm.phone || extracted.phone },
                      { icon: MapPin, label: 'Wilaya', value: editForm.wilaya || extracted.wilaya },
                      { icon: MapPin, label: 'Address', value: editForm.address || extracted.address },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icon size={15} style={{ color: 'var(--color-content-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--color-content-secondary)', width: 70, flexShrink: 0 }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: value ? 500 : 400, color: value ? 'var(--color-content-primary)' : 'var(--color-content-tertiary)' }}>
                          {value || '—'}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {extracted.products.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-line-primary)', paddingTop: 10, marginTop: 4 }}>
                    {extracted.products.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Package size={15} style={{ color: 'var(--color-content-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13 }}>{p.name}</span>
                        {p.quantity > 1 && (
                          <span className="sf-badge" style={{ marginInlineStart: 'auto' }}>x{p.quantity}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p style={{ fontSize: 12, color: 'var(--color-content-tertiary)' }}>
                ℹ️ {t.orders.importNote || t.common.error}
              </p>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="sf-btn sf-btn-ghost"
                  onClick={() => { setExtracted(null); setText(''); setEditing(false) }}
                  style={{ flex: 1 }}
                >
                  {t.orders.startOver || t.common.error}
                </button>
                <button
                  className="sf-btn sf-btn-ghost"
                  onClick={() => setEditing(!editing)}
                  style={{ flex: 1 }}
                >
                  <Edit size={14} /> {editing ? t.common.cancel : t.common.edit}
                </button>
                <button className="sf-btn sf-btn-primary" onClick={handleCreate} style={{ flex: 2 }}>
                  <CheckCircle size={16} />
                  {t.orders.importCreate}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
