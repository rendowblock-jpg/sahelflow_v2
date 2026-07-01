/**
 * Sentry integration — env-gated, zero overhead when SENTRY_DSN is not set.
 *
 * If SENTRY_DSN is configured, errors are sent to Sentry. If not, all
 * functions are no-ops. This lets the codebase ship with Sentry support
 * ready — the founder just needs to create a Sentry account + set the DSN.
 *
 * Usage:
 *   import { captureError, setSentryUser } from "@/lib/monitoring/sentry";
 *   try { ... } catch (e) { captureError(e, { context: "order.create" }); }
 */
import "server-only";

const SENTRY_DSN = process.env.SENTRY_DSN;

let sentryReady = false;
let sentryClient: unknown = null;

async function ensureSentry() {
  if (!SENTRY_DSN || sentryReady) return;
  sentryReady = true;
  try {
    // Dynamic import — @sentry/nextjs is only loaded if DSN is set
    // (the package must be installed: bun add @sentry/nextjs)
    // If not installed, this silently fails (best-effort).
    const moduleName = "@sentry/next";
    const Sentry = await import(/* @vite-ignore */ moduleName).catch(() => null);
    if (Sentry) {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        beforeSend(event: unknown) {
          // Scrub PII from request bodies
          const e = event as { request?: { data?: string } };
          if (e.request?.data) {
            e.request.data = "[REDACTED]";
          }
          return event;
        },
      });
      sentryClient = Sentry;
    }
  } catch {
    // @sentry/next not installed — no-op
  }
}

/** Capture an error to Sentry (no-op if DSN not configured). */
export async function captureError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!SENTRY_DSN) return;
  await ensureSentry();
  if (sentryClient && typeof (sentryClient as { captureException?: unknown }).captureException === "function") {
    (sentryClient as { captureException: (e: unknown, c?: unknown) => void }).captureException(error, context);
  }
}

/** Set the current user for Sentry breadcrumbs (no-op if DSN not configured). */
export async function setSentryUser(user: { id: string; email?: string }): Promise<void> {
  if (!SENTRY_DSN) return;
  await ensureSentry();
  if (sentryClient && typeof (sentryClient as { setUser?: unknown }).setUser === "function") {
    (sentryClient as { setUser: (u: unknown) => void }).setUser(user);
  }
}

/** Whether Sentry is configured (for health checks). */
export function isSentryConfigured(): boolean {
  return !!SENTRY_DSN;
}
