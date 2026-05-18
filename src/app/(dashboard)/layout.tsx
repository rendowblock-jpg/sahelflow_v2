import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'
import MobileNav from '@/components/dashboard/MobileNav'
import { AIAssistant } from '@/components/dashboard/AIAssistant'
import CommandPalette from '@/components/dashboard/CommandPalette'
import { Providers } from '@/components/providers/Providers'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Providers>
      <a href="#main-content" className="sf-skip-link">Skip to main content</a>
      <Sidebar />
      <Topbar />
      <main className="sf-main" id="main-content">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
      <MobileNav />
      <AIAssistant />
      <CommandPalette />
    </Providers>
  )
}
