'use client'

import { memo } from 'react'
import { Search } from 'lucide-react'

interface SearchInputProps {
  placeholder: string
  value: string
  onChange: (value: string) => void
  maxWidth?: number
  flex?: string
}

function SearchInputComponent({ placeholder, value, onChange, maxWidth = 400, flex }: SearchInputProps) {
  return (
    <div style={{ position: 'relative', maxWidth, flex }}>
      <Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-content-tertiary)' }} />
      <input
        className="sf-input"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ paddingInlineStart: 36 }}
      />
    </div>
  )
}

export const SearchInput = memo(SearchInputComponent)
