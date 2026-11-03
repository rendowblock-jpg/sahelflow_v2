"use client";

import { useState, type ComponentType, type Ref } from "react";
import { AlertTriangle, ChevronDown, Clock, Info, ShieldCheck, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { acknowledgeUnsaved } from "@/hooks/inbox/ingress-health-store";
import type { IngressNotice, IngressNoticeKind } from "@/hooks/inbox/use-inbox-ingress-health";
import type { Locale } from "@/lib/i18n";
import { getInboxHealthRuntimeTranslation } from "@/lib/i18n/inbox-health-runtime";
import { getInboxHealthViewRuntimeTranslation } from "@/lib/i18n/inbox-health-view-runtime";
import { getInboxRecoveryCheckRuntimeTranslation } from "@/lib/i18n/inbox-recovery-check-runtime";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import { formatWaitAge } from "@/lib/inbox/wait-age";
import { cn } from "@/lib/utils";

type StripKind = IngressNoticeKind | "recovery" | "checkFailed";
type Severity = "red" | "amber" | "info";

interface Condition {
  kind: StripKind;
  severity: Severity;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  /** Short text in the strip. */
  chip: string;
  /** Kept visible when the chip is cut short: the age of the oldest waiting message. */
  age?: string;
  /** Full sentence and explanation, shown in Details. */
  title: string;
  hint: string;
  count: number;
}

/** Most serious first, so a narrow screen cuts the soft chips and keeps the red one. */
const RANK: Record<StripKind, number> = {
  lost: 0,
  stalled: 1,
  unreachable: 2,
  waiting: 3,
  recovery: 4,
  checkFailed: 5,
  unsupported: 6,
};

const ICONS: Record<StripKind, Condition["Icon"]> = {
  lost: AlertTriangle,
  stalled: AlertTriangle,
  waiting: Clock,
  unreachable: WifiOff,
  unsupported: Info,
  recovery: AlertTriangle,
  checkFailed: AlertTriangle,
};

const SEVERITY: Record<StripKind, Severity> = {
  lost: "red",
  stalled: "amber",
  waiting: "amber",
  unreachable: "amber",
  recovery: "amber",
  checkFailed: "amber",
  unsupported: "info",
};

function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""));
}

function conditionsFor(input: {
  notices: IngressNotice[];
  recoveryCount: number;
  checkFailed: boolean;
  locale: Locale;
}): Condition[] {
  const { notices, recoveryCount, checkFailed, locale } = input;
  const health = (key: string) =>
    getInboxHealthRuntimeTranslation(locale, key) ??
    getInboxHealthViewRuntimeTranslation(locale, key) ??
    "";
  const one = (base: string, count: number) => `${base}.${count === 1 ? "one" : "other"}`;
  const list: Condition[] = [];

  for (const notice of notices) {
    const { kind, count } = notice;
    const base = { kind, severity: SEVERITY[kind], Icon: ICONS[kind], count };
    if (kind === "stalled" || kind === "unreachable") {
      const title = health(`inboxHealth.${kind}.title`);
      list.push({ ...base, chip: title, title, hint: health(`inboxHealth.${kind}.hint`) });
    } else if (kind === "lost") {
      const title = fill(health(one("inboxHealth.lost", count)), { count });
      list.push({ ...base, chip: title, title, hint: health("inboxHealth.lost.hint") });
    } else if (kind === "waiting") {
      const age = notice.minutes === null ? null : formatWaitAge(locale, notice.minutes);
      list.push({
        ...base,
        chip: fill(health(one("inboxHealth.strip.waiting", count)), { count }),
        age: age === null ? undefined : fill(health("inboxHealth.strip.oldest"), { age }),
        title: fill(health(one("inboxHealth.waiting", count)), { count }),
        hint: [
          health("inboxHealth.waiting.hint"),
          age === null ? "" : fill(health("inboxHealth.waiting.age"), { age }),
        ]
          .filter(Boolean)
          .join(" "),
      });
    } else {
      list.push({
        ...base,
        chip: fill(health(one("inboxHealth.strip.unsupported", count)), { count }),
        title: fill(health(one("inboxHealth.unsupported", count)), { count }),
        hint: health("inboxHealth.unsupported.hint"),
      });
    }
  }

  if (recoveryCount > 0) {
    list.push({
      kind: "recovery",
      severity: SEVERITY.recovery,
      Icon: ICONS.recovery,
      count: recoveryCount,
      chip: fill(health(one("inboxHealth.strip.recovery", recoveryCount)), { count: recoveryCount }),
      title: getInboxWorkspaceCopy(locale, "recoveryIssues", { count: recoveryCount }),
      hint: getInboxWorkspaceCopy(locale, "recoveryDescription"),
    });
  }
  if (checkFailed) {
    const check = (key: string) => getInboxRecoveryCheckRuntimeTranslation(locale, key) ?? "";
    list.push({
      kind: "checkFailed",
      severity: SEVERITY.checkFailed,
      Icon: ICONS.checkFailed,
      count: 0,
      chip: health("inboxHealth.strip.checkFailed"),
      title: check("inboxRecoveryCheck.title"),
      hint: check("inboxRecoveryCheck.hint"),
    });
  }
  return list.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

const TONE: Record<Severity, string> = {
  red: "border-destructive/30 bg-destructive/10",
  amber: "border-warning/25 bg-warning-soft",
  info: "border-border bg-muted/40",
};
const ICON_TONE: Record<Severity, string> = {
  red: "text-destructive",
  amber: "text-warning",
  info: "text-muted-foreground",
};

export interface InboxStatusStripProps {
  /** Reception notices from useInboxIngressHealth (settled already). */
  notices: IngressNotice[];
  /** Messages the recovery list says need a look; 0 = none (or not allowed to list them). */
  recoveryCount: number;
  /** The recovery list could not be read twice in a row. */
  checkFailed: boolean;
  checkBusy?: boolean;
  locale: Locale;
  /** Part of the inbox header row: takes its own line there. */
  embedded?: boolean;
  /** What Reconnect does (the seller presses it, never done by itself). */
  onReconnect?: () => void;
  /** Opens the recovery sheet; without it the recovery row has no button. */
  onReviewRecovery?: () => void;
  onCheckAgain: () => void;
  /** Lets the owner of the recovery sheet hand the focus back to Details. */
  detailsRef?: Ref<HTMLButtonElement>;
}

/**
 * ONE compact status strip for everything the inbox has to say about message
 * reception: waiting messages (with the age of the oldest), recovery issues,
 * messages that could not be saved (red, with its own OK), a stalled or silent
 * helper, a failed recovery check. One line, at most 40 px. The sentences, the
 * explanations and the actions (Reconnect, Review recovery, Check again) are in
 * Details, a popover that floats over the page and never pushes the list or the
 * thread. Plain counting only; nothing here says "delivered".
 */
export function InboxStatusStrip(props: InboxStatusStripProps) {
  const conditions = conditionsFor(props);
  if (conditions.length === 0) return null;
  // The body owns the open state, so it starts closed every time the strip comes back.
  return <StripBody {...props} conditions={conditions} />;
}

function StripBody({
  conditions,
  locale,
  embedded = false,
  checkBusy = false,
  onReconnect,
  onReviewRecovery,
  onCheckAgain,
  detailsRef,
}: InboxStatusStripProps & { conditions: Condition[] }) {
  const [open, setOpen] = useState(false);
  const word = (key: string) =>
    getInboxHealthRuntimeTranslation(locale, key) ??
    getInboxHealthViewRuntimeTranslation(locale, key) ??
    "";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const worst: Severity = conditions.some((c) => c.severity === "red")
    ? "red"
    : conditions.some((c) => c.severity === "amber")
      ? "amber"
      : "info";

  return (
    <div
      role="status"
      aria-label={word("inboxHealth.strip.label")}
      dir={dir}
      data-testid="ingress-health-notices"
      data-inbox-status-strip=""
      data-severity={worst}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-surface border px-2.5 py-1 text-xs",
        TONE[worst],
        embedded && "order-last mb-2 basis-full",
      )}
    >
      <ul className="m-0 flex min-w-0 flex-1 list-none items-center gap-3 overflow-hidden p-0">
        {conditions.map((condition) => (
          <li
            key={condition.kind}
            data-notice={condition.kind}
            data-severity={condition.severity}
            data-testid={condition.kind === "checkFailed" ? "recovery-check-failed" : undefined}
            title={condition.chip}
            className="flex min-w-0 items-center gap-1.5"
          >
            <condition.Icon
              className={cn("size-4 shrink-0", ICON_TONE[condition.severity])}
              aria-hidden="true"
            />
            <span className="truncate font-medium text-foreground">{condition.chip}</span>
            {condition.age ? (
              <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                {"· "}
                {condition.age}
              </span>
            ) : null}
            {condition.kind === "lost" ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => acknowledgeUnsaved(condition.count)}
              >
                {word("inboxHealth.ack")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={detailsRef}
            type="button"
            size="xs"
            variant="ghost"
            className="group shrink-0"
          >
            {word("inboxHealth.strip.details")}
            <ChevronDown
              className="transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          dir={dir}
          aria-label={word("inboxHealth.strip.label")}
          data-testid="ingress-strip-details-panel"
          className="max-h-(--radix-popover-content-available-height) w-96 max-w-(--radix-popover-content-available-width) overflow-y-auto p-0"
        >
          <div className="divide-y">
            {conditions.map((condition) => (
              <section
                key={condition.kind}
                data-detail={condition.kind}
                data-severity={condition.severity}
                className="space-y-1.5 p-3 text-xs"
              >
                <div className="flex items-start gap-2">
                  <condition.Icon
                    className={cn("mt-0.5 size-4 shrink-0", ICON_TONE[condition.severity])}
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 font-medium text-foreground">{condition.title}</p>
                </div>
                <p className="ps-6 text-muted-foreground">{condition.hint}</p>
                {condition.kind === "stalled" && onReconnect ? (
                  <div className="ps-6">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onReconnect}
                    >
                      {word("inboxHealth.stalled.reconnect")}
                    </Button>
                  </div>
                ) : null}
                {condition.kind === "recovery" && onReviewRecovery ? (
                  <div className="ps-6">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        onReviewRecovery();
                      }}
                    >
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      {getInboxWorkspaceCopy(locale, "reviewRecovery")}
                    </Button>
                  </div>
                ) : null}
                {condition.kind === "checkFailed" ? (
                  <div className="ps-6">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={checkBusy}
                      onClick={onCheckAgain}
                    >
                      {getInboxRecoveryCheckRuntimeTranslation(locale, "inboxRecoveryCheck.again") ?? ""}
                    </Button>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
