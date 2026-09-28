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
  children: React.ReactNode;
}

/**
 * The Settings modal frame used by the intercepted `(.)settings` route.
 *
 * Closing (Esc, the close button, the overlay) walks history back, so the seller
 * returns to exactly the page and scroll position they opened Settings from and
 * browser Back/Forward close and reopen the modal naturally.
 */
export function SettingsModal({ title, description, children }: SettingsModalProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setOpen(false);
        router.back();
      }}
    >
      <DialogContent
        data-settings-modal="true"
        className="settings-modal gap-0 overflow-hidden p-0 shadow-(--elevation-4) sm:p-0"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
