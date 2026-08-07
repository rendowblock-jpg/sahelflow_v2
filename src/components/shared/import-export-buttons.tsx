"use client";

import Link from "next/link";
import { Download, FileSpreadsheet, FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";

interface ImportExportButtonsProps {
  /** Export API route. Omit it when the actor has import-only authority. */
  exportRoute?: string;
  /** Import API route. Omit it when the actor has export-only authority. */
  importRoute?: string;
  size?: "default" | "sm";
}

/**
 * Shared import/export command surface.
 *
 * Import never commits a selected file directly from a list page. It routes to
 * the governed Imports workbench where parsing, mapping, validation, preview and
 * explicit commit are visible. Export remains a direct read-only command.
 */
export function ImportExportButtons({
  exportRoute,
  importRoute,
  size = "sm",
}: ImportExportButtonsProps) {
  const { t } = useI18n();
  const importEntity = importRoute?.split("/").filter(Boolean).at(-1);

  function handleExport(format: "csv" | "xlsx") {
    if (!exportRoute) return;
    window.open(`${exportRoute}?format=${format}`, "_blank", "noopener,noreferrer");
  }

  if (!exportRoute && !importRoute) return null;

  return (
    <div className="flex items-center gap-2">
      {importRoute && importEntity ? (
        <Button variant="outline" size={size} asChild>
          <Link href={`/imports#import-${importEntity}`}>
            <Upload className="size-4" aria-hidden="true" />
            {t("common.import")}
          </Link>
        </Button>
      ) : null}
      {exportRoute ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size={size}>
              <Download className="size-4" aria-hidden="true" />
              {t("common.export")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              <FileText className="size-4" aria-hidden="true" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Excel (.xlsx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
