"use client";

/**
 * ImportExportButtons — shared action buttons for data pages.
 *
 * Renders two buttons:
 *   - Export: dropdown to download CSV or XLSX
 *   - Import: opens the import panel (modal) — only rendered if importRoute is provided
 *
 * Used on: Orders, Customers, Products, Returns, Deliveries, Expenses pages.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Upload, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface ImportExportButtonsProps {
  /** Export API route (e.g. "/api/export/orders") */
  exportRoute: string;
  /** Import API route (e.g. "/api/import/orders"). If omitted, no Import button is rendered. */
  importRoute?: string;
  /** Size variant */
  size?: "default" | "sm";
}

export function ImportExportButtons({
  exportRoute,
  importRoute,
  size = "sm",
}: ImportExportButtonsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [importing, setImporting] = useState(false);

  function handleExport(format: "csv" | "xlsx") {
    const url = `${exportRoute}?format=${format}`;
    window.open(url, "_blank");
  }

  async function handleImportClick() {
    if (!importRoute) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("commit", "true");
      setImporting(true);
      try {
        const res = await fetch(importRoute, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          const count = data.inserted ?? data.count ?? 0;
          toast.success(t("import.success", { count }));
          router.refresh();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? t("import.failed"));
        }
      } catch {
        toast.error(t("import.failed"));
      } finally {
        setImporting(false);
      }
    };
    input.click();
  }

  return (
    <div className="flex items-center gap-2">
      {importRoute && (
        <Button variant="outline" size={size} onClick={handleImportClick} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {t("common.import")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size}>
            <Download className="h-4 w-4" />
            {t("common.export")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <FileText className="h-4 w-4" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel (.xlsx)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
