"use client";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Dashboard layout — the authenticated app shell.
 * Sidebar (left in LTR, right in RTL) + Topbar + content area.
 *
 * Used by the (dashboard) route group's layout.tsx.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
