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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Upload, FileText, FileSpreadsheet } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

interface ImportExportButtonsProps {
  /** Export API route (e.g. "/api/export/orders") */
  exportRoute: string;
  /** Import API route (e.g. "/api/import/orders"). If omitted, no Import button is rendered. */
  importRoute?: string;
  /** Import dialog component (if you want a custom import UI). If omitted, simple file input is used. */
  importDialog?: React.ReactNode;
  /** Size variant */
  size?: "default" | "sm";
}

export function ImportExportButtons({
  exportRoute,
  importRoute,
  importDialog,
  size = "sm",
}: ImportExportButtonsProps) {
  const { t } = useI18n();
  const [importOpen, setImportOpen] = useState(false);

  function handleExport(format: "csv" | "xlsx") {
    const url = `${exportRoute}?format=${format}`;
    window.open(url, "_blank");
  }

  function handleImportClick() {
    if (importDialog) {
      setImportOpen(true);
    } else if (importRoute) {
      // Fallback: trigger a hidden file input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv,.xlsx,.xls";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("commit", "true");
        try {
          const res = await fetch(importRoute, {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            alert(t("import.success", { count: data.inserted ?? 0 }));
            window.location.reload();
          } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error ?? t("import.failed"));
          }
        } catch {
          alert(t("import.failed"));
        }
      };
      input.click();
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {importRoute && (
          <Button variant="outline" size={size} onClick={handleImportClick}>
            <Upload className="h-4 w-4" />
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
      {importDialog && (
        <div data-import-dialog data-open={importOpen}>
          {/* The import dialog component handles its own open state via the trigger prop */}
          {importDialog}
        </div>
      )}
    </>
  );
}
