"use client";

import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";

/**
 * Ledger INB-16 — WhatsApp-style link preview card for a text bubble.
 *
 * The card is deliberately invisible until real metadata exists: no skeleton
 * that jumps the thread, no fabricated title, no image proxy. The first
 * http(s) URL of the message body is previewed; the fetch is triggered only
 * when the bubble approaches the viewport (a long thread must never fire one
 * request per bubble) and dedupes in-flight lookups module-wide.
 */

interface PreviewPayload {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
}

const resolvedCache = new Map<string, PreviewPayload | null>();
const inFlight = new Map<string, Promise<PreviewPayload | null>>();

async function fetchPreview(url: string): Promise<PreviewPayload | null> {
  const cached = resolvedCache.get(url);
  if (cached !== undefined) return cached;
  const pending = inFlight.get(url);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const response = await fetch("/api/inbox/link-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        resolvedCache.set(url, null);
        return null;
      }
      const payload = (await response.json()) as {
        preview?: PreviewPayload | null;
      };
      const preview = payload.preview ?? null;
      resolvedCache.set(url, preview);
      return preview;
    } catch {
      resolvedCache.set(url, null);
      return null;
    } finally {
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, promise);
  return promise;
}

/** First http(s) URL in the message body, trailing punctuation stripped. */
export function firstHttpUrlInText(body: string): string | null {
  const match = /https?:\/\/[^\s<>"'）\]]+/i.exec(body);
  if (!match) return null;
  return match[0].replace(/[).,;:!?'"]+$/, "");
}

export function InboxLinkPreview({
  url,
  label,
}: {
  url: string;
  /** Localized sr-only label ("Link preview"). */
  label: string;
}) {
  const [preview, setPreview] = useState<PreviewPayload | null>(
    resolvedCache.get(url) ?? null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return;
    const element = containerRef.current;
    if (!element) return;

    let cancelled = false;
    // Fetch only when the bubble approaches the viewport.
    if (typeof IntersectionObserver === "undefined") {
      requestedRef.current = true;
      void fetchPreview(url).then((payload) => {
        if (!cancelled && payload) setPreview(payload);
      });
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        requestedRef.current = true;
        observer.disconnect();
        void fetchPreview(url).then((payload) => {
          if (!cancelled && payload) setPreview(payload);
        });
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [url]);

  // Honest absence: while loading or on failure the card renders nothing at
  // all — the bubble keeps its exact text-only geometry.
  if (!preview) return <div ref={containerRef} aria-hidden="true" />;

  return (
    <div ref={containerRef}>
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        data-inbox-link-preview="true"
        aria-label={label}
        className="mt-2 block max-w-full overflow-hidden rounded-xl border border-border/60 bg-background/70 outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block border-b border-border/50 px-3 py-2 text-2xs font-medium text-primary">
          <Link2 className="me-1.5 inline size-3 align-[-2px]" aria-hidden="true" />
          {preview.siteName || preview.domain}
        </span>
        {preview.title ? (
          <span
            className="mt-2 line-clamp-2 block px-3 text-[13px] font-medium leading-5"
            dir="auto"
          >
            {preview.title}
          </span>
        ) : null}
        {preview.description ? (
          <span
            className="mt-1 line-clamp-2 block px-3 pb-2 text-2xs leading-4 text-muted-foreground"
            dir="auto"
          >
            {preview.description}
          </span>
        ) : null}
        <span className="block px-3 pb-2 text-2xs text-muted-foreground" dir="ltr">
          {preview.domain}
        </span>
      </a>
    </div>
  );
}
