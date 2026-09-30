"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsModalProps {
  title: string;
  description: string;
  /**
   * Where closing lands when Settings was loaded directly (refresh, deep
   * link) and there is no in-app page to walk back to.
   */
  closeHref?: string;
  children: React.ReactNode;
}

/**
 * The Settings window. Settings is always a centered window over the app,
 * never an in-app page: the intercepted `(.)settings` route opens it over the
 * page the seller was on, and a direct load of /settings opens it over the
 * dashboard.
 *
 * Closing (Esc, the close button, the overlay) walks history back after
 * in-app navigation, so the seller returns to exactly the page and scroll
 * position they opened Settings from; after a direct load it replaces the URL
 * with `closeHref`.
 */
export function SettingsModal({
  title,
  description,
  closeHref,
  children,
}: SettingsModalProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setOpen(false);
        if (closeHref) router.replace(closeHref, { scroll: false });
        else router.back();
      }}
    >
      <DialogContent
        ref={contentRef}
        data-settings-modal="true"
        className="settings-modal gap-0 overflow-hidden p-0 shadow-(--elevation-4) sm:p-0"
        // The window itself takes focus on open, as desktop settings windows
        // do; the search field is one Tab away instead of opening with a
        // focus ring.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
