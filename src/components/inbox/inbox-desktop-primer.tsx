"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { useMobile } from "@/hooks/use-mobile";

/**
 * Desktop Inbox is a workbench, not a landing page. When a seller enters Inbox
 * without an explicit deep link, activate the first rendered canonical queue row
 * through the workspace's existing selectChat authority. This deliberately does
 * not manufacture a URL deep link: a later mobile back action must be able to
 * clear the active thread and return to the queue without a query parameter
 * immediately re-selecting the conversation.
 */
export function InboxDesktopPrimer() {
  const mobile = useMobile();
  const searchParams = useSearchParams();
  const conversation = searchParams.get("conversation");

  useEffect(() => {
    if (mobile || conversation) return;

    let primed = false;
    const prime = () => {
      if (primed) return true;
      const existingThread = document.querySelector(
        '[data-inbox-thread="active"]',
      );
      if (existingThread) {
        primed = true;
        return true;
      }
      const firstConversation = document.querySelector<HTMLButtonElement>(
        "[data-inbox-conversation]",
      );
      if (!firstConversation) return false;
      primed = true;
      firstConversation.click();
      return true;
    };

    if (prime()) return;

    const observer = new MutationObserver(() => {
      if (prime()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [conversation, mobile]);

  return null;
}
