'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import en, { type TranslationKeys } from './locales/en'
import ar from './locales/ar'
import fr from './locales/fr'

export type Locale = 'ar' | 'fr' | 'en'
export type Direction = 'rtl' | 'ltr'

const locales: Record<Locale, TranslationKeys> = { en, ar, fr }

interface I18nContextValue {
  locale: Locale
  dir: Direction
  t: TranslationKeys
  setLocale: (locale: Locale) => void
  formatCurrency: (amount: number) => string
  formatTimeAgo: (dateStr: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const STORAGE_KEY = 'sf-locale'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ar')

  // On first mount, if no locale preference exists, default to Arabic
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      document.documentElement.setAttribute('dir', 'rtl')
      document.documentElement.setAttribute('lang', 'ar')
      document.documentElement.setAttribute('data-locale', 'ar')
      setLocaleState('ar')
    }
  }, [])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (saved && locales[saved]) {
      setLocaleState(saved)
    }
     
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    document.documentElement.setAttribute('dir', locales[locale].dir)
    document.documentElement.setAttribute('lang', locale)
    document.documentElement.setAttribute('data-locale', locale)
  }, [locale, mounted])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem(STORAGE_KEY, newLocale)
  }, [])

  const t = locales[locale]
  const dir = t.dir as Direction

  const formatCurrency = useCallback((amount: number) => {
    return `${amount.toLocaleString(locale === 'ar' ? 'ar-DZ' : 'fr-DZ')} ${t.common.currency}`
  }, [locale, t.common.currency])

  const formatTimeAgo = useCallback((dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
    if (mins < 1) return t.time.justNow
    if (mins < 60) return t.time.minutesAgo.replace('{n}', String(mins))
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t.time.hoursAgo.replace('{n}', String(hours))
    return t.time.daysAgo.replace('{n}', String(Math.floor(hours / 24)))
  }, [t])

  // Prevent hydration mismatch
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <I18nContext.Provider value={{ locale, dir, t, setLocale, formatCurrency, formatTimeAgo }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Fallback for components outside provider (e.g., during SSR)
    return {
      locale: 'ar' as Locale,
      dir: 'rtl' as Direction,
      t: ar,
      setLocale: () => {},
      formatCurrency: (n: number) => `${n.toLocaleString('ar-DZ')} د.ج`,
      formatTimeAgo: (d: string) => {
        const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
        if (mins < 1) return ar.time.justNow
        if (mins < 60) return ar.time.minutesAgo.replace('{n}', String(mins))
        const hours = Math.floor(mins / 60)
        if (hours < 24) return ar.time.hoursAgo.replace('{n}', String(hours))
        return ar.time.daysAgo.replace('{n}', String(Math.floor(hours / 24)))
      },
    }
  }
  return ctx
}

export { type TranslationKeys }
