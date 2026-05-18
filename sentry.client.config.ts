import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",
  
  // Performance monitoring — sample 10% of transactions
  tracesSampleRate: 0.1,
  
  // Don't send PII
  sendDefaultPii: false,
  
  // Filter out noisy browser extensions
  ignoreErrors: [
    "ResizeObserver loop",
    "Non-Error promise rejection",
    "Load failed",
  ],
});
