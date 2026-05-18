'use client'

/**
 * Cart — localStorage-based shopping cart for the public store.
 * No auth required. Cart persists across page reloads.
 */

import { useCallback, useSyncExternalStore } from 'react'

export interface CartItem {
  product_id: string
  name: string
  price: number
  image_url: string | null
  quantity: number
  variant?: string
}

const STORAGE_KEY = 'sf-cart'
const listeners = new Set<() => void>()
const EMPTY: CartItem[] = []
let cachedSnapshot: CartItem[] = EMPTY

function getSnapshot(): CartItem[] {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as CartItem[]
    // Only return a new reference if the data actually changed
    if (JSON.stringify(parsed) !== JSON.stringify(cachedSnapshot)) {
      cachedSnapshot = parsed
    }
    return cachedSnapshot
  } catch {
    return EMPTY
  }
}

function getServerSnapshot(): CartItem[] {
  return EMPTY
}

function notify() {
  listeners.forEach((fn) => fn())
}

function save(items: CartItem[]) {
  cachedSnapshot = items
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  notify()
}

/* ── Public API ── */

export function addToCart(item: Omit<CartItem, 'quantity'>, quantity = 1) {
  const cart = [...getSnapshot()]
  const idx = cart.findIndex(
    (c) => c.product_id === item.product_id && c.variant === item.variant
  )
  if (idx >= 0) {
    cart[idx] = { ...cart[idx], quantity: cart[idx].quantity + quantity }
  } else {
    cart.push({ ...item, quantity })
  }
  save(cart)
}

export function removeFromCart(productId: string, variant?: string) {
  save(getSnapshot().filter((c) => !(c.product_id === productId && c.variant === variant)))
}

export function updateQuantity(productId: string, quantity: number, variant?: string) {
  const cart = [...getSnapshot()]
  const idx = cart.findIndex((c) => c.product_id === productId && c.variant === variant)
  if (idx >= 0) {
    if (quantity <= 0) {
      cart.splice(idx, 1)
    } else {
      cart[idx] = { ...cart[idx], quantity }
    }
  }
  save(cart)
}

export function clearCart() {
  save([])
}

export function getCartTotal(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0)
}

/* ── React hook ── */

export function useCart() {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot,
    getServerSnapshot
  )

  return {
    items,
    total: getCartTotal(items),
    count: items.reduce((s, i) => s + i.quantity, 0),
    addToCart: useCallback(
      (item: Omit<CartItem, 'quantity'>, qty?: number) => addToCart(item, qty),
      []
    ),
    removeFromCart: useCallback((id: string, variant?: string) => removeFromCart(id, variant), []),
    updateQuantity: useCallback(
      (id: string, qty: number, variant?: string) => updateQuantity(id, qty, variant),
      []
    ),
    clearCart: useCallback(() => clearCart(), []),
  }
}
