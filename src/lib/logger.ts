/**
 * Structured logger — replaces 78+ bare console.log/console.error calls.
 *
 * In development: pretty-prints to stdout (colored).
 * In production: JSON to stdout (machine-parseable, Tauri syslog-compatible).
 * In production, warn and error lines ALSO go to <SF_DATA_DIR>/logs/app.log
 * (F-0033): the packaged app discards the console, so without that file an
 * error on a seller's PC leaves no trace. The file copy is sanitized
 * (log-sanitize.ts: no bodies, no secrets, no personal data), rate limited
 * (log-rate-limit.ts) and bounded to 1 MiB x 2 (log-file.ts). info and debug
 * never reach the file, and a file problem never stops the console line.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("order.created", { orderId: "abc123" });
 *   logger.error("api.orders.POST", err, { userId: "u1" });
 *
 * Log levels (controlled by SF_LOG_LEVEL env var, default "info"):
 *   debug < info < warn < error
 *
 * Never logs secrets or PII — callers must pass safe context objects.
 */

import { env } from "@/lib/env";
import { appLogEnabled, appendAppLog } from "@/lib/log-file";
import { createLogRateLimiter } from "@/lib/log-rate-limit";
import { sanitizeForFile } from "@/lib/log-sanitize";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getCurrentLevel(): LogLevel {
  const level = env.logLevel?.toLowerCase();
  if (level && level in LEVEL_PRIORITY) return level as LogLevel;
  return process.env.NODE_ENV === "development" ? "debug" : "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getCurrentLevel()];
}

/** The production JSON entry: the console line and (sanitized) the app.log line. */
function buildEntry(
  level: LogLevel,
  msg: string,
  context?: Record<string, unknown>,
  err?: unknown,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    entry.error = {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    };
  } else if (err !== undefined) {
    entry.error = String(err);
  }
  return entry;
}

function formatMessage(level: LogLevel, msg: string, context?: Record<string, unknown>, err?: unknown): string {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Pretty-print in dev
    const prefix = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
    if (err instanceof Error) {
      return `${prefix}\n  ${err.message}\n  ${err.stack ?? ""}`;
    }
    if (context && Object.keys(context).length > 0) {
      return `${prefix} ${JSON.stringify(context)}`;
    }
    return prefix;
  }

  // JSON in production (machine-parseable)
  return JSON.stringify(buildEntry(level, msg, context, err));
}

const appLogLimiter = createLogRateLimiter();

/**
 * Copy a warn/error line into the app log. Production only; never throws, so
 * a full disk or a locked file cannot break the caller or the console line.
 */
function teeToAppLog(
  level: LogLevel,
  msg: string,
  context?: Record<string, unknown>,
  err?: unknown,
): void {
  try {
    if (level !== "warn" && level !== "error") return;
    if (process.env.NODE_ENV !== "production" || !appLogEnabled()) return;
    const verdict = appLogLimiter.admit(msg);
    if (verdict.summaryCount > 0) {
      appendAppLog(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          msg: "log.suppressed",
          context: { count: verdict.summaryCount },
        }),
      );
    }
    if (!verdict.write) return;
    appendAppLog(JSON.stringify(sanitizeForFile(buildEntry(level, msg, context, err))));
  } catch {
    // Logging must never throw.
  }
}

export const logger = {
  debug(msg: string, context?: Record<string, unknown>): void {
    if (shouldLog("debug")) console.debug(formatMessage("debug", msg, context));
  },

  info(msg: string, context?: Record<string, unknown>): void {
    if (shouldLog("info")) console.info(formatMessage("info", msg, context));
  },

  warn(msg: string, context?: Record<string, unknown>): void {
    if (!shouldLog("warn")) return;
    try {
      console.warn(formatMessage("warn", msg, context));
    } finally {
      teeToAppLog("warn", msg, context);
    }
  },

  error(msg: string, err?: unknown, context?: Record<string, unknown>): void {
    if (!shouldLog("error")) return;
    try {
      console.error(formatMessage("error", msg, context, err));
    } finally {
      teeToAppLog("error", msg, context, err);
    }
  },
} as const;
