from pathlib import Path

ROOT = Path.cwd()
PATH = ROOT / "src/components/settings/integrations-panel.tsx"
text = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    if text.count(old) != 1:
        raise SystemExit(f"expected one integrations panel match: {old[:100]}")
    text = text.replace(old, new, 1)


replace_once(
    'import { toast } from "@/lib/toast";\n',
    'import { toast } from "@/lib/toast";\nimport { CommerceSyncRecoveryPanel } from "@/components/settings/commerce-sync-recovery-panel";\n',
)

start = text.index("  // Session 30 (AUDIT-6 I2):")
end = text.index("\n  const handleSave = async () => {", start)
new_sync = '''  // Queue a durable sync run. The request returns after persistence; provider
  // pages and canonical order mutations remain worker-owned and restart-safe.
  const [syncing, setSyncing] = useState(false);
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "sahelflow",
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as
        | { runs?: Array<{ id: string }>; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Sync queue failed");
      const queued = Array.isArray(data?.runs) ? data.runs.length : 0;
      if (queued > 0) {
        toast.success(t("commerce.runtime.queueSuccess"));
      } else {
        toast.error(t("commerce.runtime.queueEmpty"));
      }
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("integrations.syncFailed"),
      );
    } finally {
      setSyncing(false);
    }
  };
'''
text = text[:start] + new_sync + text[end:]

replace_once(
    '''      </div>

      {categories.map((category) => {''',
    '''      </div>

      <CommerceSyncRecoveryPanel />

      {categories.map((category) => {''',
)

PATH.write_text(text, encoding="utf-8")
print("Task 6 commerce runtime UI wiring applied")
