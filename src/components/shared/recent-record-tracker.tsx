"use client";

import { useEffect } from "react";

import {
  pushRecentRecord,
  type RecentRecordKind,
} from "@/hooks/use-recent-records";

interface RecentRecordTrackerProps {
  kind: RecentRecordKind;
  id: string;
  label: string;
  href: string;
}

/**
 * R4-f: renders nothing — records a record-detail visit in the local recents
 * journal so the command palette can offer "Recent" jumps. Server components
 * mount it once near the page header; the visit is written once per label
 * change, not on every re-render.
 */
export function RecentRecordTracker({
  kind,
  id,
  label,
  href,
}: RecentRecordTrackerProps) {
  useEffect(() => {
    pushRecentRecord({ kind, id, label, href });
  }, [kind, id, label, href]);

  return null;
}
