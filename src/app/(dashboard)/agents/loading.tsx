/**
 * Ledger AI-24: a 3-pane skeleton that mirrors the real workspace layout
 * (history rail / canvas / review panel) instead of a bare spinner —
 * skeleton screens win perceived latency and prevent layout jump.
 */
export default function Loading() {
  return (
    <div className="flex h-full min-h-0 gap-3 p-3" aria-hidden="true">
      <div className="hidden w-64 shrink-0 animate-pulse flex-col gap-2 rounded-xl bg-muted/40 p-3 md:flex">
        <div className="h-8 w-full rounded-lg bg-muted/60" />
        <div className="h-8 w-full rounded-lg bg-muted/50" />
        <div className="mt-2 h-24 w-full rounded-lg bg-muted/50" />
        <div className="h-24 w-full rounded-lg bg-muted/50" />
        <div className="h-24 w-full rounded-lg bg-muted/50" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="h-16 w-full animate-pulse rounded-xl bg-muted/40" />
        <div className="min-h-0 flex-1 animate-pulse rounded-xl bg-muted/30" />
        <div className="h-20 w-full animate-pulse rounded-xl bg-muted/40" />
      </div>
      <div className="hidden w-72 shrink-0 animate-pulse flex-col gap-3 rounded-xl bg-muted/40 p-3 xl:flex">
        <div className="h-8 w-2/3 rounded-lg bg-muted/60" />
        <div className="h-40 w-full rounded-lg bg-muted/50" />
        <div className="h-28 w-full rounded-lg bg-muted/50" />
      </div>
    </div>
  );
}
