"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useI18n } from "@/hooks/use-i18n";

export type GuardClick = Readonly<{
  dirty: boolean;
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  href: string | null;
  target: string | null;
  download: boolean;
  currentUrl: string;
}>;

/**
 * The in-app destination a click would leave for, or null when the click is
 * not ours to stop (clean draft, new tab, another origin, same page, ...).
 * Another origin and a tab close are covered by the browser's own prompt.
 */
export function resolveGuardedNavigation(click: GuardClick): string | null {
  if (!click.dirty || click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey || click.download) return null;
  if (click.target && click.target !== "_self") return null;
  if (!click.href) return null;
  let current: URL;
  let url: URL;
  try {
    current = new URL(click.currentUrl);
    url = new URL(click.href, current);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname && url.search === current.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Warns before unsaved Studio work is lost: the browser prompt for a tab close
 * or reload, and an in-app dialog for links (sidebar, breadcrumbs). Browser
 * Back is not intercepted.
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor) return;
      const href = resolveGuardedNavigation({
        dirty: true,
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        href: anchor.getAttribute("href"),
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
        currentUrl: window.location.href,
      });
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(href);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title={t("storefront.studioStates.unsaved.leaveTitle")}
      description={t("storefront.studioStates.unsaved.leaveBody")}
      confirmLabel={t("storefront.studioStates.unsaved.leave")}
      cancelLabel={t("storefront.studioStates.unsaved.stay")}
      destructive
      onConfirm={() => {
        const href = pending;
        setPending(null);
        if (href) router.push(href);
      }}
    />
  );
}
