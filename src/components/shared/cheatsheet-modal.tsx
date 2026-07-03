"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";

interface CheatsheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutDef {
  keys: string;
  labelKey: string;
}

const NAV_SHORTCUTS: ShortcutDef[] = [
  { keys: "g d", labelKey: "shortcuts.gd" },
  { keys: "g o", labelKey: "shortcuts.go" },
  { keys: "g c", labelKey: "shortcuts.gc" },
  { keys: "g p", labelKey: "shortcuts.gp" },
  { keys: "g l", labelKey: "shortcuts.gl" },
  { keys: "g r", labelKey: "shortcuts.gr" },
  { keys: "g i", labelKey: "shortcuts.gi" },
  { keys: "g a", labelKey: "shortcuts.ga" },
  { keys: "g s", labelKey: "shortcuts.gs" },
];

const ACTION_SHORTCUTS: ShortcutDef[] = [
  { keys: "⌘K", labelKey: "shortcuts.commandPalette" },
  { keys: "o", labelKey: "shortcuts.newOrder" },
  { keys: "c", labelKey: "shortcuts.newCustomer" },
  { keys: "p", labelKey: "shortcuts.newProduct" },
  { keys: "/", labelKey: "shortcuts.focusSearch" },
  { keys: "?", labelKey: "shortcuts.cheatsheet" },
];

export function CheatsheetModal({ open, onOpenChange }: CheatsheetModalProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common.cheatsheet")}</DialogTitle>
          <DialogDescription>{t("common.cheatsheetDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("shortcuts.navigation")}
            </h3>
            <div className="space-y-1">
              {NAV_SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between py-1">
                  <span className="text-sm">{t(s.labelKey)}</span>
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("shortcuts.actions")}
            </h3>
            <div className="space-y-1">
              {ACTION_SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between py-1">
                  <span className="text-sm">{t(s.labelKey)}</span>
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
