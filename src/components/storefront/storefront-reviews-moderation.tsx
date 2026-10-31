"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Loader2, Star, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  MANAGER_TOUCH,
  ManagerEmpty,
  ManagerSaveLine,
  settleResponse,
  useManagerAction,
} from "@/components/storefront/studio/manager-states";
import type { ModeratableReview } from "@/lib/storefront/review-service";
import { toast } from "@/lib/toast";

interface Props {
  reviews: ModeratableReview[];
  canModerate: boolean;
}

type ApiPayload = { error?: string; code?: string; ok?: boolean };

/**
 * FD-061 EX-4: seller moderation of order-verified reviews. Pending rows
 * first (the server pre-orders them), then the recently decided tail.
 * Transitions are idempotent server-side; the buttons for the already-
 * decided state disable to make the lifecycle legible.
 */
export function StorefrontReviewsModeration({ reviews, canModerate }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { state: actionState, busy, run } = useManagerAction(canModerate);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<ModeratableReview | null>(null);

  async function moderate(reviewId: string, action: "approve" | "reject"): Promise<void> {
    if (!canModerate || busy) return;
    setBusyId(reviewId);
    await run(async () => {
      const response = await fetch(
        `/api/storefront/reviews/${encodeURIComponent(reviewId)}/moderate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const result = await settleResponse<ApiPayload>(response, t, (data) => data.ok === true);
      if (!result.ok) return result;
      toast.success(
        action === "approve"
          ? t("storefronts.reviews.approvedToast")
          : t("storefronts.reviews.rejectedToast"),
      );
      // The moderation queue is server-ordered; refresh reconciles it.
      router.refresh();
      return { ok: true };
    });
    setBusyId(null);
  }

  if (reviews.length === 0) {
    return (
      <ManagerEmpty
        title={t("storefront.studioStates.manager.reviewsEmptyTitle")}
        body={t("storefront.studioStates.manager.reviewsEmptyBody")}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4" />
          {t("storefronts.reviews.title")}
        </CardTitle>
        <CardDescription>{t("storefronts.reviews.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="max-h-96 space-y-3 overflow-y-auto pe-1" role="list">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-surface border p-3"
              data-testid={`review-row-${review.status}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="flex items-center gap-0.5"
                  aria-label={t("storefronts.reviews.stars", { count: review.rating })}
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="h-3 w-3"
                      style={star <= review.rating ? { fill: "currentColor" } : undefined}
                      aria-hidden="true"
                    />
                  ))}
                </span>
                <span className="text-sm font-medium">{review.authorName}</span>
                <Badge
                  variant={
                    review.status === "approved"
                      ? "default"
                      : review.status === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {t(`storefronts.reviews.status.${review.status}`)}
                </Badge>
                <span className="ms-auto font-mono text-xs text-muted-foreground">
                  {review.orderNumber}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{review.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {review.productName} · {review.storefrontSlug}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={MANAGER_TOUCH}
                  disabled={!canModerate || busy || review.status === "approved"}
                  onClick={() => moderate(review.id, "approve")}
                >
                  {busyId === review.id ? (
                    <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="me-1 h-3.5 w-3.5" />
                  )}
                  {t("storefronts.reviews.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={`text-destructive ${MANAGER_TOUCH}`}
                  disabled={!canModerate || busy || review.status === "rejected"}
                  onClick={() => setPendingReject(review)}
                >
                  <X className="me-1 h-3.5 w-3.5" />
                  {t("storefronts.reviews.reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <ManagerSaveLine state={actionState} verb="change" />
        {pendingReject ? (
          <ConfirmDialog
            open
            onOpenChange={(open) => {
              if (!open) setPendingReject(null);
            }}
            destructive
            title={t("storefront.studioStates.manager.reviewRejectTitle")}
            description={t("storefront.studioStates.manager.reviewRejectBody", {
              author: pendingReject.authorName,
              product: pendingReject.productName,
            })}
            confirmLabel={t("storefront.studioStates.manager.reviewRejectConfirm")}
            onConfirm={() => moderate(pendingReject.id, "reject")}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
