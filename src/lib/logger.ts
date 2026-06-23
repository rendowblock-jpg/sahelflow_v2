/**
 * Structured logger — replaces 78+ bare console.log/console.error calls.
 *
 * In development: pretty-prints to stdout (colored).
 * In production: JSON to stdout (machine-parseable, Tauri syslog-compatible).
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

function formatMessage(level: LogLevel, msg: string, context?: Record<string, unknown>, err?: unknown): string {
  const ts = new Date().toISOString();
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Pretty-print in dev
    const prefix = `[${ts}] ${level.toUpperCase().padEnd(5)} ${msg}`;
    if (err instanceof Error) {
      return `${prefix}\n  ${err.message}\n  ${err.stack ?? ""}`;
    }
    if (context && Object.keys(context).length > 0) {
      return `${prefix} ${JSON.stringify(context)}`;
    }
    return prefix;
  }

  // JSON in production (machine-parseable)
  const entry: Record<string, unknown> = {
    ts,
    level,
    msg,
  };
  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }
  if (err instanceof Error) {
    entry.error = { name: err.name, message: err.message, stack: err.stack };
  } else if (err !== undefined) {
    entry.error = String(err);
  }
  return JSON.stringify(entry);
}

export const logger = {
  debug(msg: string, context?: Record<string, unknown>): void {
    if (shouldLog("debug")) console.debug(formatMessage("debug", msg, context));
  },

  info(msg: string, context?: Record<string, unknown>): void {
    if (shouldLog("info")) console.info(formatMessage("info", msg, context));
  },

  warn(msg: string, context?: Record<string, unknown>): void {
    if (shouldLog("warn")) console.warn(formatMessage("warn", msg, context));
  },

  error(msg: string, err?: unknown, context?: Record<string, unknown>): void {
    if (shouldLog("error")) console.error(formatMessage("error", msg, context, err));
  },
} as const;
