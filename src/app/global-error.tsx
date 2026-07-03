"use client";

/**
 * global-error.tsx (Phase 0 — CRITICAL gap fix).
 *
 * This is Next.js's LAST-RESORT error boundary. It replaces the ROOT layout
 * when the root layout itself throws (or any error escapes all route-level
 * error.tsx boundaries). Without it, users see a raw white page.
 *
 * Constraints (per Next.js docs):
 *   - MUST be a client component
 *   - MUST define its own <html> + <body> (it replaces root layout)
 *   - CANNOT rely on the i18n provider / theme provider / any layout context
 *     (those may be what crashed)
 *
 * So this file is intentionally self-contained: inline styles, inline i18n
 * (tiny map + cookie/locale sniff), no external UI deps. It reads the locale
 * from the document.cookie ('sf_locale=ar|fr|en') or navigator.language,
 * falling back to English.
 *
 * Sentry: only reports UNEXPECTED errors. Expected errors (4xx-style, e.g.
 * "Unauthorized") are swallowed — they shouldn't pollute the error report.
 */

type Locale = "en" | "fr" | "ar";

const STRINGS: Record<Locale, { title: string; message: string; retry: string; reload: string; reported: string }> = {
  en: {
    title: "Something went wrong",
    message: "An unexpected error occurred. Try reloading the page — if the problem persists, contact support.",
    retry: "Try again",
    reload: "Reload page",
    reported: "This error has been automatically reported.",
  },
  fr: {
    title: "Une erreur est survenue",
    message: "Une erreur inattendue s'est produite. Rechargez la page — si le problème persiste, contactez le support.",
    retry: "Réessayer",
    reload: "Recharger la page",
    reported: "Cette erreur a été signalée automatiquement.",
  },
  ar: {
    title: "حدث خطأ ما",
    message: "حدث خطأ غير متوقع. أعد تحميل الصفحة — إذا استمرت المشكلة، اتصل بالدعم.",
    retry: "إعادة المحاولة",
    reload: "إعادة تحميل الصفحة",
    reported: "تم الإبلاغ عن هذا الخطأ تلقائياً.",
  },
};

function detectLocale(): Locale {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/sf_locale=(en|fr|ar)\b/);
    if (match) return match[1] as Locale;
    const nav = navigator.language.toLowerCase();
    if (nav.startsWith("ar")) return "ar";
    if (nav.startsWith("fr")) return "fr";
  }
  return "en";
}

/** Errors that are "expected" (client-side, auth, validation) should not be
 * reported to Sentry — only unexpected crashes. Heuristic by message/digest. */
function isExpectedError(error: Error & { digest?: string }): boolean {
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("not found") ||
    msg.includes("rate limit") ||
    msg.includes("invalid") ||
    msg.includes("validation") ||
    // Next.js digest-based 4xx
    !!error.digest?.toUpperCase().startsWith("NEXT_")
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = detectLocale();
  const isRtl = locale === "ar";
  const s = STRINGS[locale];
  const expected = isExpectedError(error);

  // Report to Sentry only if unexpected. best-effort, never throws.
  if (!expected && typeof window !== "undefined") {
    try {
      // Dynamic import avoids bundling Sentry into the critical path.
      import("@sentry/nextjs")
        .then((Sentry) => Sentry.captureException(error))
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }

  return (
    <html lang={locale} dir={isRtl ? "rtl" : "ltr"}>
      <body
        style={{
          margin: 0,
          fontFamily: isRtl
            ? "'Amiri', 'Segoe UI', system-ui, sans-serif"
            : "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#fafafa",
          color: "#18181b",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          {/* Error icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))",
              border: "1px solid rgba(239,68,68,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{s.title}</h1>
            <p style={{ fontSize: "0.95rem", color: "#71717a", margin: 0, lineHeight: 1.6, maxWidth: 420 }}>
              {error.message && !expected ? error.message : s.message}
            </p>
          </div>

          {!expected && (
            <p style={{ fontSize: "0.8rem", color: "#a1a1aa", margin: 0 }}>{s.reported}</p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.6rem 1.25rem",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                background: "#fff",
                color: "#18181b",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {s.retry}
            </button>
            <button
              onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
              style={{
                padding: "0.6rem 1.25rem",
                borderRadius: 8,
                border: "none",
                background: "#0d9488",
                color: "#fff",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {s.reload}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
