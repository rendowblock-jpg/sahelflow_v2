'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { I18nProvider } from '@/lib/i18n'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from '@/components/dashboard/ToastProvider'

interface LayoutContextValue {
  isMobile: boolean
  isTablet: boolean
  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
  openSidebar: () => void
}

const LayoutContext = createContext<LayoutContextValue>({
  isMobile: false,
  isTablet: false,
  sidebarOpen: false,
  toggleSidebar: () => {},
  closeSidebar: () => {},
  openSidebar: () => {},
})

function LayoutProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth
      setIsMobile(w < 768)
      setIsTablet(w >= 768 && w < 1024)
    }

    checkViewport()
    window.addEventListener('resize', checkViewport)
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

  // Close sidebar on mobile when route or viewport changes
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [isMobile])

  const toggleSidebar = useCallback(() => setSidebarOpen(p => !p), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openSidebar = useCallback(() => setSidebarOpen(true), [])

  return (
    <LayoutContext.Provider value={{ isMobile, isTablet, sidebarOpen, toggleSidebar, closeSidebar, openSidebar }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  return useContext(LayoutContext)
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <LayoutProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </LayoutProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}
