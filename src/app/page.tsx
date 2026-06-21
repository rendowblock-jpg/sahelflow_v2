import { env } from "@/lib/env";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">SahelFlow</h1>
        <p className="text-muted-foreground text-lg">
          AI-powered back-office for Algerian COD sellers
        </p>
      </div>
      <div className="rounded-lg border border-border p-6 max-w-md space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Version</span>
          <span className="font-mono">{env.appVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Environment</span>
          <span className="font-mono">{env.isTauri ? "Desktop (Tauri)" : "Development"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className="font-mono text-green-600">Foundation scaffold ✅</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground max-w-sm text-center">
        Greenfield v3.0 — local-first Tauri architecture. Zero code from v2.
        Phase 0 build in progress.
      </p>
    </main>
  );
}
