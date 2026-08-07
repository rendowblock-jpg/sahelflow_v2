"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface ImportExportButtonsProps {
  /** Export API route. Omit it when the actor has import-only authority. */
  exportRoute?: string;
  /** Import API route. Omit it when the actor has export-only authority. */
  importRoute?: string;
  size?: "default" | "sm";
}

/**
 * Shared import/export command surface. Import and export are independent
 * authorities; callers may render either action without inventing access to the
 * other endpoint.
 */
export function ImportExportButtons({
  exportRoute,
  importRoute,
  size = "sm",
}: ImportExportButtonsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [importing, setImporting] = useState(false);

  function handleExport(format: "csv" | "xlsx") {
    if (!exportRoute) return;
    window.open(`${exportRoute}?format=${format}`, "_blank");
  }

  async function handleImportClick() {
    if (!importRoute) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("commit", "true");
      setImporting(true);
      try {
        const response = await fetch(importRoute, {
          method: "POST",
          body: formData,
        });
        if (response.ok) {
          const data = await response.json();
          const count = data.inserted ?? data.count ?? 0;
          toast.success(t("import.success", { count }));
          router.refresh();
        } else {
          const data = await response.json().catch(() => ({}));
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

  if (!exportRoute && !importRoute) return null;

  return (
    <div className="flex items-center gap-2">
      {importRoute ? (
        <Button
          variant="outline"
          size={size}
          onClick={handleImportClick}
          disabled={importing}
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-4 w-4" aria-hidden="true" />
          )}
          {t("common.import")}
        </Button>
      ) : null}
      {exportRoute ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size={size}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("common.export")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Excel (.xlsx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
