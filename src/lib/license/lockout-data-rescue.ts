/**
 * Pure helpers of the "Your data is yours" section of the licence lockout
 * screen (IDN-03). The screen only fetches; what to fetch, what to call the
 * file, how to word a failure and how big a backup is are decided here.
 */
import { LOCKOUT_EXPORT_ENTITIES, type LockoutExportEntity } from "./lockout-allowlist";

export { LOCKOUT_EXPORT_ENTITIES, type LockoutExportEntity };

/** CSV is the format every export route answers by default and the one Excel opens. */
export function lockoutExportUrl(entity: LockoutExportEntity): string {
  return `/api/export/${entity}?format=csv`;
}

export function lockoutExportFallbackName(entity: LockoutExportEntity): string {
  return `sahelflow-${entity}.csv`;
}

/** Characters a file name must not carry on Windows or in a path. */
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;

function cleanFileName(raw: string): string {
  return raw.replace(UNSAFE_NAME, "_").trim().replace(/^\.+/, "").slice(0, 120).trim();
}

/**
 * The file name the server chose (RFC 6266: `filename*` first, then `filename`),
 * made safe to save; the fallback when the header is missing or unusable.
 */
export function downloadFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
  if (extended) {
    try {
      const name = cleanFileName(decodeURIComponent(extended.trim()));
      if (name) return name;
    } catch {
      // A broken percent-escape: fall through to the plain name.
    }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(contentDisposition)?.[1];
  const bare = /filename\s*=\s*([^;"\s]+)/i.exec(contentDisposition)?.[1];
  const name = cleanFileName(quoted ?? bare ?? "");
  return name || fallback;
}

export type RescueFailure = "signIn" | "forbidden" | "failed" | "network";

export function rescueFailureFromStatus(status: number): RescueFailure {
  if (status === 401) return "signIn";
  if (status === 403) return "forbidden";
  return "failed";
}

export type BackupSize = Readonly<{ value: number; unit: "KB" | "MB" | "GB" }>;

/** The size of a backup file as a short number and a unit; null when the server gave no usable size. */
export function backupSize(bytes: unknown): BackupSize | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
  const KB = 1024;
  if (bytes < KB * KB) return { value: Math.max(1, Math.round(bytes / KB)), unit: "KB" };
  if (bytes < KB * KB * KB) return { value: Math.round((bytes / (KB * KB)) * 10) / 10, unit: "MB" };
  return { value: Math.round((bytes / (KB * KB * KB)) * 10) / 10, unit: "GB" };
}
