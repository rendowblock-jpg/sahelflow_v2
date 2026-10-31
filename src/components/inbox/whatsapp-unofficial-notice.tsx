"use client";

import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/**
 * Plain warning shown above the QR code and the connect button: the link goes
 * through the WhatsApp Web protocol, not the official Business API, and
 * WhatsApp can restrict a number that sends bulk or automatic messages.
 * Static text on purpose: no stored state, no acknowledgement, no request.
 */
export function WhatsAppUnofficialNotice({
  className,
  variant = "alert",
}: {
  className?: string;
  /** "detail" is the compact inline sentence the inbox link surface uses. */
  variant?: "alert" | "detail";
}) {
  const { t } = useI18n();
  if (variant === "detail") {
    return (
      <p
        role="note"
        data-whatsapp-unofficial-notice=""
        className={cn("text-xs leading-5", className)}
      >
        <strong className="font-semibold text-foreground">
          {t("inbox.unofficialNoticeTitle")}
        </strong>{" "}
        {t("inbox.unofficialNoticeBody")}
      </p>
    );
  }
  return (
    <Alert
      // `role="alert"` would interrupt a screen reader each time the dialog opens.
      role="note"
      data-whatsapp-unofficial-notice=""
      className={cn(
        "border-warning/40 bg-warning-soft text-foreground",
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="text-warning" />
      <AlertTitle className="line-clamp-none">
        {t("inbox.unofficialNoticeTitle")}
      </AlertTitle>
      <AlertDescription className="text-foreground">
        <p>{t("inbox.unofficialNoticeBody")}</p>
      </AlertDescription>
    </Alert>
  );
}
