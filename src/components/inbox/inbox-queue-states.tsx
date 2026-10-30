"use client";

import Link from "next/link";

import styles from "@/components/inbox/inbox-v3-workspace.module.css";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

/** Flat skeleton rows at the real row height. No shimmer, no motion. */
export function InboxQueueLoading() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className={styles.skeletonRow} />
      ))}
    </div>
  );
}

/** A blank ruled page with the three starting steps that exist in the product. */
export function InboxQueueEmpty() {
  const { t } = useI18n();
  return (
    <div data-inbox-queue-empty="" className={styles.emptyPage}>
      <h3 className="text-base font-semibold">{t("inbox.carnet.empty.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("inbox.carnet.empty.lead")}</p>
      <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm">
        <li>{t("inbox.carnet.empty.step.link")}</li>
        <li>
          <Link href="/imports" className="underline underline-offset-2">
            {t("inbox.carnet.empty.step.import")}
          </Link>
        </li>
        <li>
          <Link href="/storefronts" className="underline underline-offset-2">
            {t("inbox.carnet.empty.step.storefront")}
          </Link>
        </li>
      </ol>
    </div>
  );
}

/** The list failed to load: say what failed, offer one retry (a click, never automatic). */
export function InboxQueueError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" data-inbox-queue-error="" className={styles.emptyPage}>
      <h3 className="text-base font-semibold">{t("inbox.carnet.error.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("inbox.carnet.error.body")}</p>
      <Button type="button" variant="outline" className={styles.action} onClick={onRetry}>
        {t("inbox.carnet.error.retry")}
      </Button>
    </div>
  );
}
