"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

interface ImportPanelProps {
  /** Entity type: "products" | "customers" */
  entity: "products" | "customers";
  /** Title for the panel */
  title: string;
  description: string;
}

interface PreviewResult {
  totalRows: number;
  headers: string[];
  mapping: Record<string, string>;
  validCount: number;
  invalidCount: number;
  invalid: Array<{ rowIndex: number; errors: string[] }>;
  preview: Record<string, unknown>[];
}

interface CommitResult {
  ok: boolean;
  inserted: number;
  errors: Array<{ rowIndex: number; error: string }>;
  totalRows: number;
}

export function ImportPanel({ entity, title, description }: ImportPanelProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(null);
      setCommitResult(null);
      setError(null);
    }
  }

  async function handlePreview() {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("commit", "false");

      const res = await fetch(`/api/import/${entity}`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as PreviewResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? t("import.previewFailed"));
      }
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.failed"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setCommitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("commit", "true");
      if (preview) {
        formData.append("mapping", JSON.stringify(preview.mapping));
      }

      const res = await fetch(`/api/import/${entity}`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as CommitResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? t("import.importFailed"));
      }
      setCommitResult(data);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.failed"));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File input */}
        <div className="space-y-2">
          <Label htmlFor={`file-${entity}`}>{t("import.fileLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`file-${entity}`}
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              onChange={handleFileChange}
              className="flex-1"
            />
            <Button onClick={handlePreview} disabled={!file || previewing}>
              {previewing ? (
                <>
                  <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                  {t("import.analyzing")}
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4 me-1.5" />
                  {t("import.analyze")}
                </>
              )}
            </Button>
          </div>
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {/* Preview */}
        {preview && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span>{t("import.totalLabel")} <strong>{preview.totalRows}</strong></span>
                <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {preview.validCount} {t("import.valid")}
                </Badge>
                {preview.invalidCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {preview.invalidCount} {t("import.errors")}
                  </Badge>
                )}
              </div>
              <Button
                onClick={handleCommit}
                disabled={committing || preview.validCount === 0}
              >
                {committing ? (
                  <>
                    <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                    {t("import.importing")}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 me-1.5" />
                    {t("import.importRows", { count: preview.validCount })}
                  </>
                )}
              </Button>
            </div>

            {/* Preview table (first 10 valid rows) */}
            {preview.preview.length > 0 && (
              <div className="max-h-64 overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(preview.preview[0]!).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((val, j) => (
                          <TableCell key={j} className="text-xs">
                            {String(val ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Validation errors (first 20) */}
            {preview.invalid.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-auto">
                <p className="text-xs font-medium text-destructive">
                  {t("import.invalidLines", { count: preview.invalid.length })}
                </p>
                {preview.invalid.map((inv, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {t("import.lineN", { n: inv.rowIndex + 2 })} {inv.errors.join(", ")}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Commit result */}
        {commitResult && (
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">
                {t("import.insertedCount", { inserted: commitResult.inserted, total: commitResult.totalRows })}
              </span>
            </div>
            {commitResult.errors.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-auto">
                <p className="text-xs font-medium text-amber-600">
                  {t("import.errorCount", { count: commitResult.errors.length })}
                </p>
                {commitResult.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {t("import.lineN", { n: e.rowIndex + 2 })} {e.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Export button — links to the CSV export endpoint. */
export function ExportButton({
  entity,
  label,
}: {
  entity: "orders" | "customers" | "products";
  label: string;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/export/${entity}`} download>
        <Download className="h-4 w-4 me-1.5" />
        {label}
      </a>
    </Button>
  );
}
