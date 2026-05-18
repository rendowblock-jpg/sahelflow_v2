'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  MoreHorizontal,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const tabs = [
  { key: 'dashboard' as const, href: '/dashboard', icon: LayoutDashboard },
  { key: 'orders' as const, href: '/dashboard/orders', icon: ShoppingCart },
  { key: 'customers' as const, href: '/dashboard/customers', icon: Users },
  { key: 'products' as const, href: '/dashboard/products', icon: Package },
]

export default function MobileNav() {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <nav className="sf-mobile-nav">
      {tabs.map(tab => {
        const isActive = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
        const Icon = tab.icon
        return (
          <Link key={tab.key} href={tab.href} className={`sf-mobile-nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={20} />
            <span>{t.nav[tab.key]}</span>
          </Link>
        )
      })}
      <Link href="/dashboard/settings" className={`sf-mobile-nav-item ${pathname.startsWith('/dashboard/settings') ? 'active' : ''}`}>
        <MoreHorizontal size={20} />
        <span>{t.nav.more}</span>
      </Link>
    </nav>
  )
}
