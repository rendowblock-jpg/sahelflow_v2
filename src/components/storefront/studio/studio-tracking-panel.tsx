"use client";

import { useId, useState } from "react";

import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { normalizeStorefrontTracking, trackingFieldError, type StorefrontTracking, type TrackingField } from "@/lib/storefront/studio-tracking";

import { PanelHeader, TextField } from "./studio-controls";

type Commit = (draft: StorefrontStudioDraft) => void;

const FIELDS: ReadonlyArray<{ field: TrackingField; key: keyof StorefrontTracking; label: string; hint: string }> = [
  { field: "meta", key: "metaPixelId", label: "storefront.tracking.meta.label", hint: "storefront.tracking.meta.hint" },
  { field: "tiktok", key: "tiktokPixelId", label: "storefront.tracking.tiktok.label", hint: "storefront.tracking.tiktok.hint" },
];

/**
 * Ad tracking: the seller's Meta and TikTok pixel ids, saved in `theme.tracking` of the draft (same commit path as ContactPanel).
 * Only a valid id (or an empty field, which removes the key) is ever written; what the seller typed while it is invalid stays in this
 * panel's state, is flagged, and never reaches the draft. When the last id is removed the `tracking` key goes too, so an unset store is unchanged.
 */
export function TrackingPanel({ draft, commit }: { draft: StorefrontStudioDraft; commit: Commit }) {
  const { t } = useI18n();
  const baseId = useId();
  const tracking = draft.theme.tracking;
  const [rejected, setRejected] = useState<Partial<Record<TrackingField, string>>>({});

  const setField = (field: TrackingField, key: keyof StorefrontTracking, value: string) => {
    if (trackingFieldError(field, value)) {
      setRejected((previous) => ({ ...previous, [field]: value }));
      return;
    }
    setRejected((previous) => {
      const { [field]: _dropped, ...rest } = previous;
      return rest;
    });
    const next = normalizeStorefrontTracking({ ...tracking, [key]: value });
    if (next) {
      commit({ ...draft, theme: { ...draft.theme, tracking: next } });
    } else {
      const { tracking: _removed, ...theme } = draft.theme;
      commit({ ...draft, theme });
    }
  };

  return (
    <div className="space-y-4">
      <PanelHeader title={t("storefront.tracking.title")} description={t("storefront.tracking.description")} />
      {FIELDS.map(({ field, key, label, hint }) => {
        const typed = rejected[field];
        const value = typed ?? tracking?.[key] ?? "";
        const errorKey = typed === undefined ? null : trackingFieldError(field, typed);
        const errorId = `${baseId}-${field}-error`;
        return (
          <div key={field} className="space-y-1.5">
            <TextField
              label={t(label)}
              dir="ltr"
              value={value}
              maxLength={64}
              hint={t(hint)}
              invalid={errorKey !== null}
              describedBy={errorKey ? errorId : undefined}
              onChange={(next) => setField(field, key, next)}
            />
            {errorKey ? (
              <p id={errorId} role="alert" className="text-caption text-destructive">
                {t(errorKey)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
