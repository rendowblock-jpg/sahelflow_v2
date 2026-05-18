'use client'

import { useEffect, useRef } from 'react'

/**
 * Traps keyboard focus within a container element.
 * When active, Tab/Shift+Tab cycle only through focusable elements inside the container.
 * Pressing Escape calls onEscape.
 */
export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    const container = containerRef.current
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusFirst = () => {
      const first = container.querySelector<HTMLElement>(focusableSelector)
      first?.focus()
    }

    const timer = setTimeout(focusFirst, 50)

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        onEscape()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [active, onEscape])

  return containerRef
}
