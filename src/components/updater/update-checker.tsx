"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { CheckCircle2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { isTauriEnv } from "@/lib/env";
import { localizeServerMessage } from "@/lib/i18n/localize-server-message";
import { offerUpdate, withdrawUpdate } from "@/lib/updater/update-controller";
import { getUpdateSnapshot } from "@/lib/updater/update-store";

const UPDATER_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
/** Updates are not urgent: checking every six hours is plenty and costs nothing. */
const UPDATER_CURRENT_POLL_INTERVAL_MS = 6 * 60 * 60_000;
/** The workspace needs its first minute for itself (a normal launch takes about 32 s). */
const UPDATER_FIRST_CHECK_DELAY_MS = 90_000;

function isUpdaterAccessFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:permissions associated with this command|(?:plugin:)?(?:updater|process)[.:|][\w-]+\s+not allowed|(?:capabilit|acl).*(?:denied|forbidden|not allowed)|(?:denied|forbidden|not allowed).*(?:capabilit|acl)|(?:ipc|invoke).*(?:denied|forbidden|not allowed))/i.test(
    message,
  );
}

function isUpdaterTransientFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:offline|network|timed?\s*out|timeout|connection|connect(?:ion)?\s+(?:refused|reset|closed)|dns|name resolution|temporar(?:y|ily)|failed to fetch|error sending request|wsaeacces|os error 10013|socket.*access permissions|http(?:\s+status)?\s+(?:408|429|5\d\d)\b)/i.test(
    message,
  );
}

/** An update already downloading, ready or installing needs no further checks. */
function updateIsInHand(): boolean {
  const phase = getUpdateSnapshot().phase;
  return phase === "downloading" || phase === "ready" || phase === "installing";
}

/**
 * Headless updater coordinator (Tauri desktop only; renders nothing).
 *
 * It looks for a signed update shortly after the workspace is up and then every
 * few hours, and hands what it finds to the update store. The seller sees it as
 * a chip in the top bar (`UpdateChip`), never as a dialog, and nothing is
 * downloaded until the seller asks.
 *
 * The updater plugin verifies every download against the public key in
 * tauri.conf.json. Updates are hosted on GitHub Releases.
 */
export function UpdateChecker() {
  const { t } = useI18n();
  const translate = useRef(t);

  useEffect(() => {
    translate.current = t;
  }, [t]);

  useEffect(() => {
    if (!isTauriEnv()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastReportedFailure = "";

    const wait = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, milliseconds);
      });

    void (async () => {
      await wait(UPDATER_FIRST_CHECK_DELAY_MS);
      timer = undefined;
      let retryIndex = 0;

      while (!cancelled) {
        let nextCheckDelay = UPDATER_CURRENT_POLL_INTERVAL_MS;

        if (!updateIsInHand()) {
          try {
            // Dynamic import: the desktop bridge only works in the Tauri context.
            const { checkForDesktopUpdate } = await import("@/lib/updater/desktop-update-check");
            const update = await checkForDesktopUpdate();
            if (cancelled) {
              void update?.close?.().catch(() => undefined);
              return;
            }
            if (update) {
              offerUpdate(update);
            } else {
              withdrawUpdate();
            }
            retryIndex = 0;
            lastReportedFailure = "";
          } catch (err) {
            if (cancelled) return;
            const description =
              err instanceof Error
                ? localizeServerMessage(err.message)
                : translate.current("updater.unknownError");
            const transientFailure = isUpdaterTransientFailure(err);

            // A broken desktop capability cannot recover within this binary.
            // Transport classification runs first because Windows socket denials
            // can mention access permissions without being Tauri ACL failures.
            if (!transientFailure && isUpdaterAccessFailure(err)) {
              toast.error(translate.current("updater.checkFailed"), { description });
              console.warn("[updater] access check failed:", err);
              return;
            }

            const shouldRetrySilently =
              transientFailure && retryIndex < UPDATER_RETRY_DELAYS_MS.length;
            if (shouldRetrySilently) {
              nextCheckDelay =
                UPDATER_RETRY_DELAYS_MS[retryIndex] ?? UPDATER_CURRENT_POLL_INTERVAL_MS;
              retryIndex += 1;
              console.warn("[updater] transient check failed; retry scheduled:", err);
            } else {
              // Permanent feed/manifest failures surface at once; transient ones
              // after the bounded 1/5/15-minute retry budget. The same failure
              // is reported once, not at every six-hour check. Periodic polling
              // stays alive so a repaired feed recovers without a restart.
              if (description !== lastReportedFailure) {
                lastReportedFailure = description;
                toast.error(translate.current("updater.checkFailed"), { description });
              }
              console.error("[updater] check failed; periodic recovery retained:", err);
              retryIndex = 0;
            }
          }
        }

        await wait(nextCheckDelay);
        timer = undefined;
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return null;
}

/** Compact status indicator for the settings page (shows "up to date"). */
export function UpdaterStatus() {
  const { t } = useI18n();
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    if (isTauriEnv()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTauri(true);
    }
  }, []);

  if (!isTauri) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("updater.webMode")}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5 text-success">
      <CheckCircle2 className="h-3 w-3" />
      {t("updater.autoUpdateEnabled")}
    </Badge>
  );
}
