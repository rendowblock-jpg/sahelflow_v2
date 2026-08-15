"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useMobile } from "@/hooks/use-mobile";

/**
 * Desktop Inbox is a workbench, not a landing page. When a seller enters Inbox
 * without an explicit deep link, prime the existing conversation deep-link
 * authority with the most recent permitted conversation. Mobile intentionally
 * keeps the queue-first drill-in model.
 */
export function InboxDesktopPrimer() {
  const mobile = useMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversation = searchParams.get("conversation");

  useEffect(() => {
    if (mobile || conversation) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/conversations", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          conversations?: Array<{ id?: string }>;
        };
        const firstId = data.conversations?.find(
          (entry) => typeof entry.id === "string" && entry.id.length > 0,
        )?.id;
        if (!firstId || controller.signal.aborted) return;

        const next = new URLSearchParams(searchParams.toString());
        next.set("conversation", firstId);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Inbox still remains usable as the queue-first fallback.
        }
      }
    })();

    return () => controller.abort();
  }, [conversation, mobile, pathname, router, searchParams]);

  return null;
}
