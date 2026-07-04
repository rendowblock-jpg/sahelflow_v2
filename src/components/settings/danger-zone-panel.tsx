"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Download, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

export function DangerZonePanel() {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (confirmText !== "RESET") {
      toast.error('Type "RESET" to confirm');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings/reset", { method: "POST" });
      if (!res.ok) throw new Error("Reset failed");
      toast.success("Database reset successfully");
      window.location.href = "/setup";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export all */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Export all data</p>
            <p className="text-xs text-muted-foreground">Download a full backup before resetting.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/export/orders"><Download className="me-2 h-4 w-4" />Export</a>
          </Button>
        </div>

        {/* Reset database */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-destructive">Reset database</p>
            <p className="text-xs text-muted-foreground">This will delete ALL orders, customers, products, and settings. This cannot be undone.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type RESET to confirm</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              className="max-w-xs"
            />
          </div>
          <Button variant="destructive" size="sm" onClick={handleReset} disabled={loading || confirmText !== "RESET"}>
            <Trash2 className="me-2 h-4 w-4" />
            {loading ? "Resetting..." : "Reset everything"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
