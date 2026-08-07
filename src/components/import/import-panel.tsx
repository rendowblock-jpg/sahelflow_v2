"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";

interface ImportPanelProps {
  entity: "orders" | "products" | "customers";
  title: string;
  description: string;
}

interface PreviewResult {
  totalRows: number;
  headers?: string[];
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

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    setFile(nextFile);
    setPreview(null);
    setCommitResult(null);
    setError(null);
  }

  async function handlePreview() {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("commit", "false");
      const response = await fetch(`/api/import/${entity}`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as PreviewResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("import.previewFailed"));
      setPreview(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("import.failed"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!file || !preview) return;
    setCommitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("commit", "true");
      formData.append("mapping", JSON.stringify(preview.mapping));
      const response = await fetch(`/api/import/${entity}`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as CommitResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("import.importFailed"));
      setCommitResult(data);
      setPreview(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("import.failed"));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card id={`import-${entity}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="size-4" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet className="me-1.5 size-4" aria-hidden="true" />
              )}
              {previewing ? t("import.analyzing") : t("import.analyze")}
            </Button>
          </div>
          {file ? (
            <p className="text-xs text-muted-foreground">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          ) : null}
        </div>

        {preview ? (
          <section className="space-y-3 rounded-md border p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span>{t("import.totalLabel")} <strong>{preview.totalRows}</strong></span>
                <Badge className="gap-1 border-success/20 bg-success/10 text-success">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  {preview.validCount} {t("import.valid")}
                </Badge>
                {preview.invalidCount > 0 ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="size-3" aria-hidden="true" />
                    {preview.invalidCount} {t("import.errors")}
                  </Badge>
                ) : null}
              </div>
              <Button onClick={handleCommit} disabled={committing || preview.validCount === 0}>
                {committing ? (
                  <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="me-1.5 size-4" aria-hidden="true" />
                )}
                {committing
                  ? t("import.importing")
                  : t("import.importRows", { count: preview.validCount })}
              </Button>
            </div>

            {preview.preview.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(preview.preview[0]!).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {Object.values(row).map((value, columnIndex) => (
                          <TableCell key={columnIndex} className="text-xs">
                            {String(value ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {preview.invalid.length > 0 ? (
              <div className="max-h-32 space-y-1 overflow-auto">
                <p className="text-xs font-medium text-destructive">
                  {t("import.invalidLines", { count: preview.invalid.length })}
                </p>
                {preview.invalid.map((invalid, index) => (
                  <p key={index} className="text-xs text-muted-foreground">
                    {t("import.lineN", { n: invalid.rowIndex + 2 })} {invalid.errors.join(", ")}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {commitResult ? (
          <section className="space-y-2 rounded-md border p-4" aria-live="polite">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              <span className="font-medium">
                {t("import.insertedCount", {
                  inserted: commitResult.inserted,
                  total: commitResult.totalRows,
                })}
              </span>
            </div>
            {commitResult.errors.length > 0 ? (
              <div className="max-h-32 space-y-1 overflow-auto">
                <p className="text-xs font-medium text-warning">
                  {t("import.errorCount", { count: commitResult.errors.length })}
                </p>
                {commitResult.errors.slice(0, 10).map((entry, index) => (
                  <p key={index} className="text-xs text-muted-foreground">
                    {t("import.lineN", { n: entry.rowIndex + 2 })} {entry.error}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

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
        <Download className="me-1.5 size-4" aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}
