"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";

import { GoogleSheetsIcon } from "@/components/brand/brand-icons";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import { fillCopy, getGoogleSheetsBridgeCopy } from "@/lib/i18n/google-sheets-bridge";
import { toast } from "@/lib/toast";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Google Sheets bridge setup (Settings → Commerce channels).
 *
 * Not connected: three guided steps — copy this installation's Apps Script,
 * deploy it in the seller's own sheet, paste the web-app URL. Connected: tab,
 * column mapping, a dry-run preview with row-level problems and product
 * matching, automation switches, and the last sync result.
 */

const FIELDS = [
  "customerName",
  "phone",
  "wilaya",
  "commune",
  "address",
  "productName",
  "variantName",
  "quantity",
  "deliveryCost",
  "orderNumber",
  "productSku",
  "notes",
] as const;
type FieldKey = (typeof FIELDS)[number];
const IGNORE = "__ignore__";
const INTERVALS = [2, 5, 15, 30] as const;
const LANGUAGES = [
  { id: "ar", label: "العربية" },
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
] as const;

interface BridgeConfig {
  spreadsheetName: string | null;
  sheet: string | null;
  sheets: string[];
  headers: string[];
  mapping: Record<string, FieldKey>;
  productAliases: Record<string, string>;
  autoImport: boolean;
  intervalMinutes: 2 | 5 | 15 | 30;
  writeBack: boolean;
  statusLanguage: "ar" | "fr" | "en";
  lastSyncAt: string | null;
  lastResult: {
    imported: number;
    alreadyImported: number;
    failed: number;
    problem: string | null;
  } | null;
}

interface BridgeState {
  connected: boolean;
  config: BridgeConfig;
}

type ProblemKey =
  | "product"
  | "ambiguousProduct"
  | "variant"
  | "phone"
  | "name"
  | "wilaya"
  | "quantity"
  | "grouping"
  | "other";

interface Preview {
  orders: number;
  alreadyImported: number;
  preview: Array<{
    row: number;
    customerName: string;
    phone: string;
    wilaya: string;
    product: string;
    quantity: number;
    alreadyImported: boolean;
  }>;
  problems: Array<{ row: number; problem: ProblemKey; detail: string }>;
  unmatchedProducts: string[];
  catalogProducts: string[];
}

type ApiError = { error?: string; code?: string };

const JSON_HEADERS = { "Content-Type": "application/json", "x-requested-with": "sahelflow" };

export function GoogleSheetsBridgePanel({ canManage }: { canManage: boolean }) {
  const { locale } = useI18n();
  const copy = getGoogleSheetsBridgeCopy(locale);
  const [state, setState] = useState<BridgeState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsPin, setNeedsPin] = useState<null | (() => Promise<void>)>(null);
  const [pin, setPin] = useState("");
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});

  const applyState = useCallback((next: BridgeState) => {
    setState(next);
    setMapping(next.config.mapping);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/google-sheets/bridge", { cache: "no-store" });
      if (!response.ok) throw new Error();
      applyState((await response.json()) as BridgeState);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [applyState]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  /** Runs a request; a PIN challenge pauses it and retries after verification. */
  const request = useCallback(
    async (
      key: string,
      input: RequestInfo,
      init: RequestInit,
      onSuccess: (body: unknown) => void | Promise<void>,
    ) => {
      const attempt = async () => {
        setBusy(key);
        try {
          const response = await fetch(input, init);
          const body = (await response.json().catch(() => ({}))) as ApiError;
          if (response.status === 403 && body.code === "REAUTHENTICATION_REQUIRED") {
            setNeedsPin(() => attempt);
            return;
          }
          if (!response.ok) throw new Error(body.error || copy.errors.generic);
          await onSuccess(body);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : copy.errors.generic);
        } finally {
          setBusy(null);
        }
      };
      await attempt();
    },
    [copy.errors.generic],
  );

  async function verifyPin() {
    const retry = needsPin;
    if (!retry || !pin.trim()) return;
    setBusy("pin");
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) throw new Error(copy.verifyPin);
      setPin("");
      setNeedsPin(null);
      await retry();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  const copyScript = () =>
    request(
      "script",
      "/api/integrations/google-sheets/bridge/script",
      { method: "POST", headers: JSON_HEADERS },
      async (body) => {
        await navigator.clipboard.writeText((body as { script: string }).script);
        setCopied(true);
        toast.success(copy.copied);
      },
    );

  const connect = () =>
    request(
      "connect",
      "/api/integrations/google-sheets/bridge/connect",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ url }) },
      (body) => {
        applyState(body as BridgeState);
        setUrl("");
        toast.success(copy.connected);
      },
    );

  const save = (key: string, patch: Record<string, unknown>, message = copy.saved) =>
    request(
      key,
      "/api/integrations/google-sheets/bridge",
      { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(patch) },
      (body) => {
        applyState(body as BridgeState);
        if (message) toast.success(message);
      },
    );

  const runPreview = (overrides: Record<string, unknown> = {}) =>
    request(
      "preview",
      "/api/integrations/google-sheets/bridge/preview",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ mapping, ...overrides }),
      },
      (body) => setPreview(body as Preview),
    );

  const sync = () =>
    request(
      "sync",
      "/api/integrations/google-sheets/bridge/sync",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ full: true }) },
      (body) => {
        applyState(body as BridgeState);
        setPreview(null);
      },
    );

  const disconnect = () => {
    if (!window.confirm(copy.disconnectConfirm)) return;
    void request(
      "disconnect",
      "/api/integrations/google-sheets/bridge",
      { method: "DELETE", headers: JSON_HEADERS },
      (body) => {
        applyState(body as BridgeState);
        setPreview(null);
        setCopied(false);
      },
    );
  };

  const fieldByHeader = mapping;
  const usedFields = useMemo(() => new Set(Object.values(mapping)), [mapping]);
  const missingRequired = (["customerName", "phone", "wilaya", "productName"] as const).filter(
    (field) => !usedFields.has(field) && !(field === "productName" && usedFields.has("productSku")),
  );

  const config = state?.config;
  const last = config?.lastResult;

  return (
    <Panel data-google-sheets-bridge={state?.connected ? "connected" : "setup"} className="p-5">
      <PanelHeader>
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-surface bg-success-soft text-success">
            <GoogleSheetsIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <PanelTitle>{copy.title}</PanelTitle>
            <PanelDescription>{copy.description}</PanelDescription>
          </div>
        </div>
        <Badge variant={state?.connected ? "default" : "outline"} className="shrink-0">
          {state?.connected ? copy.connected : copy.notConnected}
        </Badge>
      </PanelHeader>

      {loadFailed ? (
        <div className="flex items-center justify-between gap-3 rounded-surface border border-warning/30 bg-warning-subtle p-3 text-body-sm">
          <span>{copy.errors.generic}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {needsPin ? (
        <div className="mb-4 flex flex-col gap-2 rounded-surface border border-primary/30 bg-primary-subtle p-3 sm:flex-row sm:items-center">
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <Label htmlFor="sheets-bridge-pin" className="flex-1 text-body-sm">
            {copy.verifyPin}
          </Label>
          <Input
            id="sheets-bridge-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void verifyPin();
            }}
            className="sm:w-40"
          />
          <Button size="sm" onClick={() => void verifyPin()} disabled={!pin.trim() || busy === "pin"}>
            {busy === "pin" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {copy.verify}
          </Button>
        </div>
      ) : null}

      {state && !state.connected ? (
        <ol className="space-y-5">
          <SetupStep number={1} title={copy.step1} done={copied}>
            <p className="text-body-sm text-muted-foreground">{copy.step1Body}</p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => void copyScript()}
              disabled={!canManage || busy === "script"}
              data-google-sheets-copy-script=""
            >
              {busy === "script" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="size-4" aria-hidden="true" />
              )}
              {copied ? copy.copied : copy.copyScript}
            </Button>
          </SetupStep>
          <SetupStep number={2} title={copy.step2}>
            <ol className="list-decimal space-y-1.5 ps-5 text-body-sm text-foreground marker:text-muted-foreground">
              {copy.step2Items.split("|").map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <p className="mt-3 flex gap-2 text-caption text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {copy.step2Note}
            </p>
          </SetupStep>
          <SetupStep number={3} title={copy.step3} last>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                dir="ltr"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={copy.urlPlaceholder}
                aria-label={copy.step3}
                className="text-start"
                spellCheck={false}
                autoComplete="off"
              />
              <Button
                onClick={() => void connect()}
                disabled={!canManage || !url.trim() || busy === "connect"}
                className="shrink-0"
              >
                {busy === "connect" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {copy.connect}
              </Button>
            </div>
          </SetupStep>
        </ol>
      ) : null}

      {state?.connected && config ? (
        <div className="space-y-6">
          {/* Connection summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border bg-surface-1 p-4">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-body-sm font-medium text-foreground">
                {config.spreadsheetName}
              </p>
              <p className="text-caption text-muted-foreground">
                {copy.lastSync}:{" "}
                {config.lastSyncAt
                  ? formatDateTime(config.lastSyncAt, locale)
                  : copy.never}
              </p>
              {last ? (
                <p className="text-caption text-muted-foreground">
                  {fillCopy(copy.resultLine, {
                    imported: last.imported,
                    already: last.alreadyImported,
                    failed: last.failed,
                  })}
                </p>
              ) : null}
              {last?.problem ? (
                <p className="flex items-center gap-1.5 text-caption text-warning">
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                  {fillCopy(copy.problem, { message: last.problem })}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={config.sheet ?? undefined}
                onValueChange={(sheet) => void save("sheet", { sheet })}
                disabled={!canManage || busy !== null}
              >
                <SelectTrigger size="sm" className="w-40" aria-label={copy.tab}>
                  <SelectValue placeholder={copy.tab} />
                </SelectTrigger>
                <SelectContent>
                  {config.sheets.map((sheet) => (
                    <SelectItem key={sheet} value={sheet}>
                      {sheet}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => void sync()} disabled={busy !== null || missingRequired.length > 0}>
                {busy === "sync" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="size-4" aria-hidden="true" />
                )}
                {busy === "sync" ? copy.syncing : copy.syncNow}
              </Button>
              {canManage ? (
                <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy !== null}>
                  <Unplug className="size-4" aria-hidden="true" />
                  {copy.disconnect}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Columns */}
          <section className="space-y-3" aria-labelledby="sheets-columns">
            <div>
              <h4 id="sheets-columns" className="text-title-3 text-foreground">
                {copy.columns}
              </h4>
              <p className="text-body-sm text-muted-foreground">{copy.columnsBody}</p>
            </div>
            <div className="divide-y divide-border/70 rounded-surface border">
              {config.headers.map((header) => (
                <div key={header} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-body-sm text-foreground" dir="auto">
                    {header}
                  </span>
                  <Select
                    value={fieldByHeader[header] ?? IGNORE}
                    onValueChange={(value) =>
                      setMapping((current) => {
                        const next = { ...current };
                        for (const [key, field] of Object.entries(next)) {
                          if (field === value) delete next[key];
                        }
                        if (value === IGNORE) delete next[header];
                        else next[header] = value as FieldKey;
                        return next;
                      })
                    }
                    disabled={!canManage}
                  >
                    <SelectTrigger size="sm" className="w-52 shrink-0" aria-label={header}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORE}>{copy.ignore}</SelectItem>
                      {FIELDS.map((field) => (
                        <SelectItem key={field} value={field}>
                          {copy.fields[field]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className={cn(
                  "text-caption",
                  missingRequired.length > 0 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {copy.required}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void runPreview()} disabled={busy !== null}>
                  {busy === "preview" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {busy === "preview" ? copy.checking : copy.checkRows}
                </Button>
                {canManage ? (
                  <Button
                    size="sm"
                    onClick={() => void save("mapping", { mapping })}
                    disabled={busy !== null || missingRequired.length > 0}
                  >
                    {copy.saveColumns}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          {/* Preview */}
          {preview ? (
            <section className="space-y-3" aria-labelledby="sheets-preview" data-google-sheets-preview="">
              <div>
                <h4 id="sheets-preview" className="text-title-3 text-foreground">
                  {copy.previewTitle}
                </h4>
                <p className="text-body-sm text-muted-foreground">
                  {fillCopy(copy.previewCounts, {
                    orders: preview.orders,
                    already: preview.alreadyImported,
                    problems: preview.problems.length,
                  })}
                </p>
              </div>
              {preview.preview.length > 0 ? (
                <div className="overflow-x-auto rounded-surface border">
                  <table className="w-full text-body-sm">
                    <thead className="bg-surface-1 text-caption text-muted-foreground">
                      <tr>
                        {[copy.row, copy.customer, copy.phone, copy.wilaya, copy.product, copy.quantity, ""].map(
                          (heading, index) => (
                            <th key={index} className="px-3 py-2 text-start font-medium">
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {preview.preview.map((row) => (
                        <tr key={`${row.row}-${row.product}`}>
                          <td className="numeric-value px-3 py-2 text-muted-foreground">{row.row}</td>
                          <td className="px-3 py-2" dir="auto">{row.customerName}</td>
                          <td className="numeric-value px-3 py-2" dir="ltr">{row.phone}</td>
                          <td className="px-3 py-2">{row.wilaya}</td>
                          <td className="px-3 py-2" dir="auto">{row.product}</td>
                          <td className="numeric-value px-3 py-2">{row.quantity}</td>
                          <td className="px-3 py-2">
                            <Badge variant={row.alreadyImported ? "outline" : "default"}>
                              {row.alreadyImported ? copy.imported : copy.new}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {preview.problems.length > 0 ? (
                <div className="rounded-surface border border-warning/30 bg-warning-subtle p-3">
                  <p className="text-body-sm font-medium text-foreground">{copy.problemsTitle}</p>
                  <ul className="mt-2 space-y-1 text-caption text-muted-foreground">
                    {preview.problems.slice(0, 12).map((problem) => (
                      <li key={problem.row} title={problem.detail}>
                        <span className="numeric-value text-foreground">
                          {copy.row} {problem.row}
                        </span>{" "}
                        — {copy.problems[problem.problem]}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.unmatchedProducts.length > 0 && canManage ? (
                <div className="space-y-3 rounded-surface border p-3">
                  <div>
                    <p className="text-body-sm font-medium text-foreground">{copy.productsTitle}</p>
                    <p className="text-caption text-muted-foreground">{copy.productsBody}</p>
                  </div>
                  {preview.unmatchedProducts.map((text) => (
                    <div key={text} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-body-sm" dir="auto">
                        {text}
                      </span>
                      <Select
                        value={aliases[text] ?? ""}
                        onValueChange={(product) =>
                          setAliases((current) => ({ ...current, [text]: product }))
                        }
                      >
                        <SelectTrigger size="sm" className="w-56" aria-label={text}>
                          <SelectValue placeholder={copy.chooseProduct} />
                        </SelectTrigger>
                        <SelectContent>
                          {preview.catalogProducts.map((product) => (
                            <SelectItem key={product} value={product}>
                              {product}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={busy !== null || Object.keys(aliases).length === 0}
                      onClick={() =>
                        void save("aliases", {
                          productAliases: { ...config.productAliases, ...aliases },
                        }).then(() => runPreview())
                      }
                    >
                      {copy.saveMatches}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Automation */}
          <section className="space-y-3" aria-labelledby="sheets-automation">
            <h4 id="sheets-automation" className="text-title-3 text-foreground">
              {copy.automation}
            </h4>
            <div className="divide-y divide-border/70 rounded-surface border">
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <Label htmlFor="sheets-auto-import" className="text-body-sm">
                  {copy.autoImport}
                </Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(config.intervalMinutes)}
                    onValueChange={(value) => void save("interval", { intervalMinutes: Number(value) }, "")}
                    disabled={!canManage || !config.autoImport}
                  >
                    <SelectTrigger size="sm" className="w-28" aria-label={copy.every}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVALS.map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          {fillCopy(copy.minutes, { count: minutes })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch
                    id="sheets-auto-import"
                    checked={config.autoImport}
                    onCheckedChange={(autoImport) => void save("auto", { autoImport }, "")}
                    disabled={!canManage}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <Label htmlFor="sheets-write-back" className="text-body-sm">
                  {copy.writeBack}
                </Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={config.statusLanguage}
                    onValueChange={(statusLanguage) => void save("language", { statusLanguage }, "")}
                    disabled={!canManage || !config.writeBack}
                  >
                    <SelectTrigger size="sm" className="w-32" aria-label={copy.statusLanguage}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((language) => (
                        <SelectItem key={language.id} value={language.id}>
                          {language.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch
                    id="sheets-write-back"
                    checked={config.writeBack}
                    onCheckedChange={(writeBack) => void save("writeBack", { writeBack }, "")}
                    disabled={!canManage}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </Panel>
  );
}

function SetupStep({
  number,
  title,
  done = false,
  last = false,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border text-caption font-semibold",
            done
              ? "border-success/40 bg-success-soft text-success"
              : "border-border bg-surface-1 text-muted-foreground",
          )}
        >
          {done ? <Check className="size-3.5" aria-hidden="true" /> : <span className="numeric-value">{number}</span>}
        </span>
        {!last ? <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" /> : null}
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-body-sm font-medium text-foreground">{title}</p>
        <div className="mt-1.5">{children}</div>
      </div>
    </li>
  );
}
